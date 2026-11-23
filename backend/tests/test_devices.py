"""기기 기록 연결(link-device)과 산책 재개(walks/today)."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from azure.cosmos.exceptions import CosmosHttpResponseError
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.store import MemoryStore, get_store
from app.store_cosmos import CosmosStore

from .fake_cosmos import FakeDatabase
from .test_auth import CHILD, PASSWORD, SECRET
from .test_report import PLACEMENT

DEVICE = "device-3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b"
OTHER_DEVICE = "device-0a1b2c3d-4e5f-4a6b-9c8d-7e6f5a4b3c2d"
LINK_WRITES = 27  # setup_family 기록을 옮길 때 쓰기 횟수 (test_count_link_writes)


@pytest.fixture(autouse=True)
def with_secret(monkeypatch):
    monkeypatch.setattr(config, "settings", config.Settings(jwt_secret=SECRET))


def make_client(store):
    app.dependency_overrides[get_store] = lambda: store
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(params=["memory", "cosmos"])
def env(request):
    store = MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())
    yield make_client(store), store
    app.dependency_overrides.clear()


def guardian(c, email="parent@example.com"):
    token = c.post("/auth/signup", json={"email": email, "password": PASSWORD}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    return headers, c.post("/children", json=CHILD, headers=headers).json()["id"]


def device_walk(c, day, child_id=DEVICE, headers=None, done=True):
    """토큰 없이(기기) 학습 1·2·3을 하고 마친다. 기록: 산책 1, attempts 3, 대화 1."""
    h = headers or {}
    wid = c.post("/walks", json={"child_id": child_id, "topic_id": "joy", "day": day}, headers=h).json()["id"]
    c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": ["기뻐요"]}, headers=h)
    c.post(f"/lessons/mirror/walks/{wid}/record", json={"mode": "touch", "score": None}, headers=h)
    conv = c.post(f"/lessons/story/walks/{wid}/talk", headers=h).json()["conversation_id"]
    c.post(f"/lessons/story/walks/{wid}/action", json={"action_index": 0}, headers=h)
    c.post(f"/conversations/{conv}/turn", json={"choice_index": 0, "input_mode": "picture"}, headers=h)
    if done:
        c.post(f"/walks/{wid}/complete", headers=h)
    return wid


def records(store, child_id):
    return {"walks": sorted(w.id for w in store.list_walks(child_id)),
            "attempts": sorted(a["id"] for a in store.list_attempts(child_id)),
            "conversations": sorted(c["id"] for c in store.list_conversations(child_id)),
            "stickers": store.sticker_days(child_id)}


def link(c, headers, child_id, device=DEVICE):
    return c.post(f"/children/{child_id}/link-device", json={"device_child_id": device}, headers=headers)


def setup_family(c):
    """기기 기록: 산책 2(스티커 11-21, 11-22), 레벨 테스트 1. 프로필에는 이미 11-21 스티커가 있다."""
    device_walk(c, "2026-11-21")
    device_walk(c, "2026-11-22")
    c.post(f"/children/{DEVICE}/placement", json=PLACEMENT)
    h, child_id = guardian(c)
    device_walk(c, "2026-11-21", child_id=child_id, headers=h)
    return h, child_id


def test_link_moves_everything_and_merges_same_day_sticker(env):
    c, store = env
    h, child_id = setup_family(c)
    before_device, before_profile = records(store, DEVICE), records(store, child_id)
    res = link(c, h, child_id)
    assert res.status_code == 200, res.text
    assert res.json()["moved"] == {"walks": 2, "attempts": 7, "conversations": 2, "stickers": 1, "stickers_merged": 1}
    after = records(store, child_id)
    assert after["walks"] == sorted(before_device["walks"] + before_profile["walks"])
    assert after["attempts"] == sorted(before_device["attempts"] + before_profile["attempts"])
    assert after["conversations"] == sorted(before_device["conversations"] + before_profile["conversations"])
    assert after["stickers"] == ["2026-11-21", "2026-11-22"]  # 같은 날짜는 하나만
    assert records(store, DEVICE) == {"walks": [], "attempts": [], "conversations": [], "stickers": []}
    assert c.get(f"/children/{child_id}/placement", headers=h).json()["level"] == "basic"
    report = c.get(f"/children/{child_id}/report?from=2026-11-01&to=2026-11-30", headers=h).json()
    assert report["walks"]["completed"] == 3 and report["sticker_days"] == ["2026-11-21", "2026-11-22"]


def test_link_twice_adds_nothing(env):
    c, store = env
    h, child_id = setup_family(c)
    link(c, h, child_id)
    once = records(store, child_id)
    again = link(c, h, child_id)
    assert again.status_code == 200
    assert again.json()["moved"] == {"walks": 0, "attempts": 0, "conversations": 0, "stickers": 0, "stickers_merged": 0}
    assert records(store, child_id) == once


class Faulty:
    """가짜 Cosmos의 쓰기(create·upsert·delete)를 세어 n번째에서 한 번 실패시킨다."""

    def __init__(self, db: FakeDatabase):
        self.count, self.fail_at = 0, None
        for container in db.containers.values():
            for name in ("create_item", "upsert_item", "delete_item"):
                setattr(container, name, self._wrap(getattr(container, name)))

    def _wrap(self, real):
        def write(*args, **kwargs):
            self.count += 1
            if self.count == self.fail_at:
                raise CosmosHttpResponseError(status_code=503, message="Service unavailable")
            return real(*args, **kwargs)
        return write


def build_family():
    db = FakeDatabase()
    store = CosmosStore(db)
    c = make_client(store)
    h, child_id = setup_family(c)
    return db, store, c, h, child_id


def test_count_link_writes():
    db, store, c, h, child_id = build_family()
    faulty = Faulty(db)
    faulty.count = 0
    assert link(c, h, child_id).status_code == 200
    app.dependency_overrides.clear()
    # 연결 1 + (복사 + 삭제) × (산책 2 + attempts 7 + 대화 2) + 스티커 (생성 시도 + 삭제) × 2
    assert faulty.count == LINK_WRITES == 1 + 2 * 11 + 2 * 2


@pytest.mark.parametrize("fail_at", range(1, LINK_WRITES + 1))
def test_link_failing_at_any_write_then_retry_has_no_duplicates_or_gaps(fail_at):
    db, store, c, h, child_id = build_family()
    expected_device, expected_profile = records(store, DEVICE), records(store, child_id)
    faulty = Faulty(db)
    faulty.count, faulty.fail_at = 0, fail_at
    first = link(c, h, child_id)
    assert first.status_code == 500  # 중간에 실패
    retry = link(c, h, child_id)  # 다시 하기
    assert retry.status_code == 200, retry.text
    after = records(store, child_id)
    for kind in ("walks", "attempts", "conversations"):
        assert after[kind] == sorted(expected_device[kind] + expected_profile[kind]), (fail_at, kind)
    assert after["stickers"] == ["2026-11-21", "2026-11-22"]
    assert records(store, DEVICE) == {"walks": [], "attempts": [], "conversations": [], "stickers": []}
    for name in ("walks", "attempts", "conversations", "stickers"):  # 파티션 전체에서도 문서마다 하나
        ids = [doc_id for (_, doc_id) in db.containers[name].items]
        assert len(ids) == len(set(ids)), (fail_at, name)
    app.dependency_overrides.clear()


# ---------- 다른 집 기록 가져가기 막기 ----------
def test_device_goes_only_to_the_first_profile(env):
    c, store = env
    h, child_id = setup_family(c)
    assert link(c, h, child_id).status_code == 200
    other, other_child = guardian(c, "other@example.com")
    assert link(c, other, other_child).status_code == 409  # 다른 집
    assert records(store, other_child)["walks"] == []


def test_linked_device_id_needs_owner_token(env):
    c, store = env
    h, child_id = setup_family(c)
    link(c, h, child_id)
    other, _ = guardian(c, "other@example.com")
    for method, path, body in [("get", f"/children/{DEVICE}/stickers", None),
                               ("get", f"/children/{DEVICE}/placement", None),
                               ("get", f"/children/{DEVICE}/walks/today", None),
                               ("post", "/walks", {"child_id": DEVICE, "topic_id": "joy"})]:
        kw = {"json": body} if body else {}
        assert getattr(c, method)(path, **kw).status_code == 401, path  # 연결한 뒤에는 토큰 없이 못 씀
        assert getattr(c, method)(path, headers=other, **kw).status_code == 403, path
        assert getattr(c, method)(path, headers=h, **kw).status_code in (200, 404), path  # 연결한 보호자는 됨


def test_link_requires_owner_token_and_real_device_id(env):
    c, _ = env
    h, child_id = guardian(c)
    other, _ = guardian(c, "other@example.com")
    assert link(c, {}, child_id).status_code == 401
    assert link(c, other, child_id).status_code == 403
    for bad in ("kid1", "device-123", "device-3f2b8c1e-9a4d-1e6f-8b7a-1c2d3e4f5a6b", child_id, DEVICE.upper()):
        assert link(c, h, child_id, device=bad).status_code == 422, bad


def test_two_families_claiming_one_device_at_once(env):
    c, store = env
    device_walk(c, "2026-11-21")
    families = [guardian(c, f"p{i}@example.com") for i in range(6)]
    barrier = Barrier(len(families))

    def claim(family):
        barrier.wait()
        return link(c, *family).status_code

    with ThreadPoolExecutor(len(families)) as pool:
        codes = list(pool.map(claim, families))
    assert sorted(codes) == [200] + [409] * 5
    owners = [child for (_, child), code in zip(families, codes) if code == 200]
    assert len(records(store, owners[0])["walks"]) == 1


# ---------- 산책 재개 ----------
def test_today_walk_shows_open_walk_and_step(env):
    c, _ = env
    assert c.get(f"/children/{OTHER_DEVICE}/walks/today").json() == {"walk": None}
    device_walk(c, "2026-01-01", child_id=OTHER_DEVICE, done=False)  # 다른 날짜는 보지 않는다
    wid = c.post("/walks", json={"child_id": OTHER_DEVICE, "topic_id": "sad"}).json()["id"]  # 오늘
    c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": ["슬퍼요"]})
    today = c.get(f"/children/{OTHER_DEVICE}/walks/today").json()["walk"]
    assert today["id"] == wid and today["step"] == 1 and today["status"] == "inProgress"
    c.post(f"/walks/{wid}/complete")
    assert c.get(f"/children/{OTHER_DEVICE}/walks/today").json() == {"walk": None}


def test_today_walk_follows_profile_rules(env):
    c, _ = env
    h, child_id = guardian(c)
    other, _ = guardian(c, "other@example.com")
    wid = c.post("/walks", json={"child_id": child_id, "topic_id": "joy"}, headers=h).json()["id"]
    assert c.get(f"/children/{child_id}/walks/today", headers=h).json()["walk"]["id"] == wid
    assert c.get(f"/children/{child_id}/walks/today").status_code == 401
    assert c.get(f"/children/{child_id}/walks/today", headers=other).status_code == 403


def test_linking_in_the_middle_of_a_walk_keeps_the_same_walk_id(env):
    """기기로 산책하다가 프로필을 골라 연결해도, 같은 walkId로 이어서 한 기록이 프로필에 남는다."""
    c, store = env
    wid = c.post("/walks", json={"child_id": DEVICE, "topic_id": "joy"}).json()["id"]
    c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": ["기뻐요"]})  # 학습 1은 기기로
    h, child_id = guardian(c)
    assert link(c, h, child_id).json()["moved"]["walks"] == 1

    # 연결 뒤에는 프로필 토큰으로, 원래 walkId 그대로 이어서 한다
    assert c.get(f"/walks/{wid}", headers=h).json()["child_id"] == child_id
    assert c.post(f"/lessons/mirror/walks/{wid}/record", json={"mode": "camera", "score": None}, headers=h).status_code == 200
    conv = c.post(f"/lessons/story/walks/{wid}/talk", headers=h).json()["conversation_id"]
    assert c.post(f"/conversations/{conv}/turn", json={"choice_index": 0, "input_mode": "picture"}, headers=h).status_code == 200
    done = c.post(f"/walks/{wid}/complete", headers=h).json()
    assert done["sticker_given"] is True and done["walk"]["child_id"] == child_id

    assert c.post(f"/lessons/mirror/walks/{wid}/record", json={"mode": "touch", "score": None}).status_code == 401
    assert [a["kind"] for a in sorted(store.list_attempts(child_id), key=lambda a: a["created_at"])] == ["emotion", "mirror"]
    assert len(store.list_conversations(child_id)) == 1 and store.list_attempts(DEVICE) == []
    report = c.get(f"/children/{child_id}/report", headers=h).json()
    assert report["walks"]["completed"] == 1 and report["mirror"]["camera"] == 1 and report["story"]["turns"] == 1
