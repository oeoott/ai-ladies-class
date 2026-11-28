"""공통 7감정 연결. 초안(content/drafts: fear·disgust·neutral)은 CONTENT_DRAFTS를 켰을 때만 합쳐진다.
초안 내용은 검수 전이므로 아이 순환에는 기본으로 들어가지 않는다."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config
from app.content import EMOTION_CODES, draft_ids, emotions, tales, topic_ids
from app.main import app
from app.services import prompts
from app.store import MemoryStore, get_store

DRAFTS = Path(__file__).resolve().parents[1] / "app" / "content" / "drafts"
SEVEN = {"anger": "화남", "disgust": "혐오", "fear": "두려움", "joy": "기쁨", "neutral": "무표정", "sad": "슬픔",
         "surprise": "놀람"}


@pytest.fixture
def drafts_on(monkeypatch):
    monkeypatch.setattr(config, "settings", config.Settings(content_drafts=True))
    store = MemoryStore()
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_the_seven_codes_and_names():
    assert EMOTION_CODES == SEVEN
    assert set(prompts.EXPRESSIONS) == set(SEVEN)  # 친구 표정으로 그릴 수 있는 7개


def test_children_see_only_reviewed_emotions_by_default():
    assert topic_ids() == ["joy", "surprise", "sad", "anger"]
    assert draft_ids() == ["fear", "disgust", "neutral"]
    c = TestClient(app)
    assert [t["id"] for t in c.get("/topics").json()] == topic_ids()
    assert c.post("/walks", json={"child_id": "kid1", "topic_id": "fear"}).status_code == 422


def test_drafts_are_marked_and_say_what_they_need():
    for name in ("emotions.json", "tales.json"):
        doc = json.loads((DRAFTS / name).read_text(encoding="utf-8"))
        assert doc["status"] == "draft" and doc["reviewedBy"] is None and doc["reviewedAt"] is None
        assert doc["needs"]["art"] and doc["needs"]["review"]


def test_with_drafts_all_seven_flow_through_topics_lessons_story_and_talk(drafts_on):
    c = drafts_on
    assert topic_ids() == ["joy", "surprise", "sad", "anger", "fear", "disgust", "neutral"]
    assert {i: emotions()[i]["label"] for i in topic_ids()} == {i: SEVEN[i] for i in topic_ids()}
    for topic in ("fear", "disgust", "neutral"):
        walk = c.post("/walks", json={"child_id": "kid1", "topic_id": topic, "day": "2026-11-28"}).json()
        assert c.get(f"/lessons/emotion/{topic}").status_code == 200
        answer = c.post(f"/lessons/emotion/walks/{walk['id']}/answer", json={"selected": [emotions()[topic]["word"]]})
        assert answer.json()["correct"] is True
        assert c.get(f"/lessons/mirror/{topic}").json()["motion"] == emotions()[topic]["motion"]
        story = c.get(f"/lessons/story/{topic}").json()
        assert len(story["pages"]) == 3 and len(story["actions"]) == 2
        assert c.post(f"/lessons/story/walks/{walk['id']}/action", json={"action_index": 1}).status_code == 200
        talk = c.post(f"/lessons/story/walks/{walk['id']}/talk", json={"character": "rabbit", "action_index": 1}).json()
        assert "{친구}" not in talk["ask"] and talk["choices"] == tales()[topic]["talk"]["choices"]
        first = c.post(f"/conversations/{talk['conversation_id']}/turn", json={"choice_index": 0}).json()
        assert first["reply"] == tales()[topic]["talk"]["replies"][0]
        assert first["expression"] in prompts.EXPRESSIONS
        end = c.post(f"/conversations/{talk['conversation_id']}/turn", json={"choice_index": 1}).json()
        assert end["finished"] and end["reply"] == tales()[topic]["talk"]["ends"][1]
        assert c.post(f"/walks/{walk['id']}/complete").status_code == 200


@pytest.mark.parametrize("topic", ["fear", "disgust", "neutral"])
def test_draft_entries_have_the_same_shape_as_the_reviewed_ones(drafts_on, topic):
    e, t = emotions(), tales()
    assert set(e[topic]) == set(e["joy"]) and set(e[topic]["practice"]) == set(e["joy"]["practice"])
    assert len(e[topic]["practice"]["expression"]) == 2 and len(e[topic]["practice"]["cues"]) == 2
    assert e[topic]["practice"]["target"] in e[topic]["practice"]["cues"]
    assert set(t[topic]) == set(t["joy"]) and set(t[topic]["talk"]) == set(t["joy"]["talk"])
    talk = t[topic]["talk"]
    for key in ("choices", "replies", "replyExpressions", "extra", "ends", "endExpressions"):
        assert len(talk[key]) == 2, key
    for face in [*talk["replyExpressions"], *talk["endExpressions"], *(a["expression"] for a in t[topic]["actions"])]:
        assert face in prompts.EXPRESSIONS
    for key in ("choices", "replies", "extra", "ends"):  # {친구}는 질문(ask·again)에만
        assert all("{친구}" not in line for line in talk[key])


def test_old_names_still_resolve_for_existing_records(drafts_on):
    assert "평온" in emotions()["neutral"]["aliases"] and "싫음" in emotions()["disgust"]["aliases"]
