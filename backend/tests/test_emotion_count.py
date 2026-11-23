"""감정을 늘릴 때 content JSON에 한 항목씩만 넣으면 되는지 확인한다.

실제 새 감정 내용은 넣지 않고, 테스트 안에서만 가짜 감정 3개를 더해 7개로 만든다.
"""
import copy

import pytest
from fastapi.testclient import TestClient

from app import config
from app.content import emotions, tales, topic_ids
from app.main import app
from app.store import MemoryStore, get_store

from .test_auth import SECRET
from .test_report import guardian

FAKES = {"fake1": "가짜하나", "fake2": "가짜둘", "fake3": "가짜셋"}


@pytest.fixture
def seven(monkeypatch):
    """emotions()/tales()가 돌려주는 캐시된 dict에 가짜 감정을 더했다가 테스트 뒤 되돌린다."""
    monkeypatch.setattr(config, "settings", config.Settings(jwt_secret=SECRET))
    e, t = emotions(), tales()
    saved = (copy.deepcopy(e), copy.deepcopy(t))
    for fake, label in FAKES.items():
        e[fake] = {**copy.deepcopy(e["joy"]), "label": label, "word": label + "요"}
        t[fake] = copy.deepcopy(t["joy"])
    store = MemoryStore()
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app)
    app.dependency_overrides.clear()
    e.clear(); e.update(saved[0])
    t.clear(); t.update(saved[1])


def test_seven_emotions_flow_through_topics_lessons_stickers_and_report(seven):
    c = seven
    assert topic_ids() == ["joy", "surprise", "sad", "anger", *FAKES]  # JSON 순서 = 순환 순서
    assert [t["label"] for t in c.get("/topics").json()][-3:] == list(FAKES.values())

    h, child_id = guardian(c)
    walk = c.post("/walks", json={"child_id": child_id, "topic_id": "fake2", "day": "2026-11-20"}, headers=h)
    assert walk.status_code in (200, 201), walk.text
    wid = walk.json()["id"]
    assert c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": ["가짜둘요"]}, headers=h).json()["correct"]
    assert c.get("/lessons/story/fake2").status_code == 200  # 동화도 같은 id로 열림
    assert c.post(f"/walks/{wid}/complete", headers=h).status_code == 200
    assert "2026-11-20" in c.get(f"/children/{child_id}/report?from=2026-11-20&to=2026-11-20", headers=h).json()["sticker_days"]

    report = c.get(f"/children/{child_id}/report?from=2026-11-20&to=2026-11-20", headers=h).json()
    assert len(report["emotion"]) == 7  # 대시보드 감정 줄 7개
    fake = next(s for s in report["emotion"] if s["topic_id"] == "fake2")
    assert (fake["label"], fake["answers"], fake["accuracy"]) == ("가짜둘", 1, 1.0)


def test_unknown_emotion_is_still_rejected(seven):
    c = seven
    h, child_id = guardian(c)
    assert c.post("/walks", json={"child_id": child_id, "topic_id": "fake9", "day": "2026-11-20"}, headers=h).status_code == 422
    assert c.get("/lessons/story/fake9").status_code == 422


def test_without_fakes_there_are_four():
    assert topic_ids() == ["joy", "surprise", "sad", "anger"]
