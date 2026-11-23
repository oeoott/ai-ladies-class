"""시연 데이터 (scripts/seed_demo.py): 메모리·Cosmos 둘 다, 다시 실행하면 지우고 새로 만든다."""
from datetime import date, timedelta

import pytest

from app import config
from app.services import auth
from app.services.report import build_report
from app.store import MemoryStore
from app.store_cosmos import CosmosStore
from scripts import seed_demo

from .fake_cosmos import FakeDatabase

TODAY = date(2026, 11, 23)


@pytest.fixture(params=["memory", "cosmos"])
def store(request):
    return MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())


def two_weeks(store, child_id):
    return build_report(store, child_id, TODAY - timedelta(days=13), TODAY)


def test_seed_fills_two_weeks_for_the_dashboard(store):
    out = seed_demo.seed(store, TODAY)
    assert (out["walks"], out["reviews"], out["conversations"]) == (10, 1, 11)
    r = two_weeks(store, out["child_id"])
    assert (r.walks.completed, r.walks.reviews) == (10, 1)
    assert len(r.sticker_days) == 10 and str(TODAY) not in r.sticker_days  # 오늘은 시연에서 직접
    by = {row.topic_id: (row.answers, row.correct, row.accuracy, row.hint_used) for row in r.emotion}
    assert by == {"joy": (3, 3, 1.0, 0), "surprise": (4, 3, 0.75, 1), "sad": (5, 3, 0.6, 2), "anger": (2, 2, 1.0, 0)}
    assert (r.mirror.records, r.mirror.camera, r.mirror.touch) == (11, 5, 6)
    assert (r.story.conversations, r.story.turns, r.story.voice_turns) == (11, 21, 7)
    assert (r.story.fallback_to_picture, r.story.blocked) == (2, 0)
    assert store.latest_placement(out["child_id"])["level"] == "expand"


def test_seed_again_replaces_the_demo_account(store):
    first = seed_demo.seed(store, TODAY)
    second = seed_demo.seed(store, TODAY, password="another-demo-pass")
    assert first["guardian_id"] != second["guardian_id"]
    assert store.get_guardian(first["guardian_id"]) is None
    assert store.list_walks(first["child_id"]) == [] and store.list_conversations(first["child_id"]) == []
    assert store.sticker_days(first["child_id"]) == []
    r = two_weeks(store, second["child_id"])
    assert (r.walks.completed, r.story.conversations) == (10, 11)
    guardian = store.get_guardian_by_email(seed_demo.DEMO_EMAIL)
    assert guardian["id"] == second["guardian_id"]
    assert auth.verify_password("another-demo-pass", guardian["password_hash"])
    assert len(store.list_children(guardian["id"])) == 1


def test_seeded_lines_come_from_the_tale_script(store):
    from app.content import tales

    out = seed_demo.seed(store, TODAY)
    for conv in store.list_conversations(out["child_id"]):
        talk = tales()[conv["topic_id"]]["talk"]
        for turn, line in enumerate(conv["turns"]):
            assert line["said"] in (talk["choices"] if turn == 0 else talk["extra"])
            assert line["reply"] in (talk["replies"] if turn == 0 else talk["ends"])


def test_main_refuses_memory_without_serve_and_cosmos_without_password(monkeypatch):
    with pytest.raises(SystemExit):
        seed_demo.main([])  # 메모리인데 --serve 없음: 끝나면 사라지므로 막는다
    monkeypatch.setattr(config, "settings", config.Settings(store="cosmos", cosmos_endpoint="https://x",
                                                            cosmos_key="k", cosmos_database="d"))
    with pytest.raises(SystemExit):
        seed_demo.main([])  # Cosmos에는 비밀번호를 정해야 한다
