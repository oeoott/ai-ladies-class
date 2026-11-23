"""저장소 인터페이스 테스트. 같은 테스트를 메모리 구현과 Cosmos 구현(가짜 클라이언트)에 모두 돌린다."""
import ast
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from app import config, store as store_module
from app.main import app
from app.store import MemoryStore, Store, build_store, get_store
from app.store_cosmos import CONTAINERS, CosmosStore, is_local_emulator

from .fake_cosmos import FakeDatabase
from .test_walk_flow import start

DAY = date(2026, 11, 22)
APP = Path(__file__).resolve().parents[1] / "app"


@pytest.fixture(params=["memory", "cosmos"])
def store(request) -> Store:
    return MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())


def make_walk(store, child_id="kid-1", **kw):
    data = {"child_id": child_id, "topic_id": "joy", "level": "basic", "review": False, "day": DAY, **kw}
    return store.create_walk(**data)


def test_guardian_email_is_unique(store):
    first = store.create_guardian("mom@test.com", "hash")
    assert first and store.create_guardian("mom@test.com", "other") is None
    assert store.get_guardian_by_email("mom@test.com")["id"] == first["id"]
    assert store.get_guardian(first["id"])["email"] == "mom@test.com"
    assert store.get_guardian_by_email("dad@test.com") is None


def test_one_child_per_guardian_in_store(store):
    assert store.create_child("g1", nickname="하늘", character="lion")
    assert store.create_child("g1", nickname="바다", character="bear") is None
    assert store.create_child("g2", nickname="바다", character="bear")


def test_child_belongs_to_its_guardian_only(store):
    child = store.create_child("g1", nickname="하늘", birth_year=2019, character="raon")
    assert store.get_child("g1", child["id"])["nickname"] == "하늘"
    assert store.get_child("g2", child["id"]) is None
    assert [c["id"] for c in store.list_children("g1")] == [child["id"]] and store.list_children("g2") == []
    child["character"] = "bori"
    store.save_child(child)
    assert store.get_child("g1", child["id"])["character"] == "bori"


def test_walk_round_trip_and_changes_need_save(store):
    walk = make_walk(store)
    loaded = store.get_walk(walk.id)
    assert loaded == walk and loaded.day == DAY
    loaded.step = 2
    assert store.get_walk(walk.id).step == 0  # 복사본이라 저장 전에는 그대로
    store.save_walk(loaded)
    assert store.get_walk(walk.id).step == 2
    make_walk(store, child_id="kid-2")
    assert [w.id for w in store.list_walks("kid-1")] == [walk.id]
    assert store.get_walk("missing") is None


def test_attempts_and_conversations_are_kept_per_child(store):
    walk = make_walk(store)
    row = store.add_attempt(walk, "emotion", selected=["기뻐요"], correct=True)
    assert row["child_id"] == "kid-1" and row["walk_id"] == walk.id
    assert store.list_attempts("kid-1")[0]["selected"] == ["기뻐요"] and store.list_attempts("kid-2") == []

    conv = store.create_conversation(walk)
    assert conv["child_id"] == "kid-1" and conv["topic_id"] == "joy" and conv["safety"] == []
    conv["turns"].append({"said": "[전화번호]", "reply": "좋아.", "input_mode": "voice"})
    store.save_conversation(conv)
    assert store.get_conversation(conv["id"])["turns"] == conv["turns"]
    assert [c["id"] for c in store.list_conversations("kid-1")] == [conv["id"]]
    assert store.get_conversation("missing") is None


def test_sticker_once_per_child_and_day(store):
    assert store.give_sticker("kid-1", DAY) is True
    assert store.give_sticker("kid-1", DAY) is False
    assert store.give_sticker("kid-1", date(2026, 11, 23)) is True
    assert store.give_sticker("kid-2", DAY) is True
    assert store.sticker_days("kid-1") == ["2026-11-22", "2026-11-23"]


def test_concurrent_sticker_requests_give_one(store):
    n = 16
    barrier = Barrier(n)

    def give(_):
        barrier.wait()  # 모든 요청이 동시에 출발
        return store.give_sticker("kid-1", DAY)

    with ThreadPoolExecutor(n) as pool:
        results = list(pool.map(give, range(n)))
    assert results.count(True) == 1 and store.sticker_days("kid-1") == ["2026-11-22"]


def test_cosmos_containers_and_partition_keys():
    db = FakeDatabase()
    s = CosmosStore(db)
    assert {name: c.pk_field for name, c in db.containers.items()} == {
        "guardian_emails": "id", "device_links": "id", "guardians": "id", "children": "guardian_id", "walks": "child_id",
        "attempts": "child_id", "conversations": "child_id", "stickers": "child_id"}
    assert set(CONTAINERS) == set(db.containers)
    assert db.containers["children"].unique_keys == ["guardian_id"]
    guardian = s.create_guardian("Mom@Test.com", "hash")
    assert db.containers["guardian_emails"].read_item("mom@test.com", "mom@test.com")["guardian_id"] == guardian["id"]
    s.give_sticker("kid-1", DAY)
    doc = next(iter(db.containers["stickers"].items.values()))
    assert doc["id"] == "kid-1_2026-11-22" and doc["child_id"] == "kid-1"
    s.sticker_days("kid-1")
    assert db.containers["stickers"].queries[-1]["partition_key"] == "kid-1"  # 아이 기록은 파티션 안에서 읽음


def test_cosmos_strips_system_fields():
    s = CosmosStore(FakeDatabase())
    conv = s.create_conversation(make_walk(s))
    assert not any(k.startswith("_") for k in s.get_conversation(conv["id"]))


def test_full_api_flow_on_cosmos_store():
    db = FakeDatabase()
    app.dependency_overrides[get_store] = lambda: CosmosStore(db)
    try:
        c = TestClient(app)
        for _ in range(2):  # 같은 날 두 번 마쳐도 스티커 1장
            wid = start(c)["id"]
            assert c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": ["기뻐요"]}).status_code == 200
            assert c.post(f"/lessons/mirror/walks/{wid}/record", json={"mode": "touch", "score": None}).status_code == 200
            conv_id = c.post(f"/lessons/story/walks/{wid}/talk").json()["conversation_id"]
            assert not c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 0}).json()["fallback_to_picture"]
            assert c.post(f"/conversations/{conv_id}/end").json() == {"ended_by": "button", "turns": 1}
            done = c.post(f"/walks/{wid}/complete").json()
        assert done["sticker_given"] is False and done["sticker_count"] == 1
        assert c.get(f"/walks/{wid}").json()["status"] == "completed"
        assert len(db.containers["attempts"].items) == 4 and len(db.containers["conversations"].items) == 2
        saved = next(iter(db.containers["conversations"].items.values()))
        assert saved["ended_by"] == "button" and len(saved["turns"]) == 1
    finally:
        app.dependency_overrides.clear()


def test_store_is_chosen_by_setting(monkeypatch):
    assert isinstance(build_store(config.Settings()), MemoryStore)
    with pytest.raises(RuntimeError, match="COSMOS_ENDPOINT"):
        build_store(config.Settings(store="cosmos"))
    assert config.load_settings(Path("missing.env"), {"STORE": "COSMOS"}).store == "cosmos"
    with pytest.raises(ValueError):
        config.load_settings(Path("missing.env"), {"STORE": "sql"})
    monkeypatch.setattr(store_module, "_store", None)
    assert get_store() is get_store() and isinstance(get_store(), MemoryStore)


def test_certificate_check_is_off_only_for_local_emulator():
    assert is_local_emulator("https://localhost:8081") and is_local_emulator("http://127.0.0.1:8081")
    assert not is_local_emulator("https://maeum.documents.azure.com:443")
    assert not is_local_emulator("https://localhost.evil.example")


def test_routers_use_only_the_store_interface():
    interface = {name for name, value in vars(Store).items() if getattr(value, "__isabstractmethod__", False)}
    for path in [*(APP / "routers").glob("*.py"), APP / "deps.py"]:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
        assert "MemoryStore" not in names and "CosmosStore" not in names, path
        used = {n.attr for n in ast.walk(tree)
                if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "store"}
        assert used <= interface, (path, used - interface)
