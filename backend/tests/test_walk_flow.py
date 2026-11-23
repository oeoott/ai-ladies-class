from fastapi.testclient import TestClient

from app.main import app
from app.store import MemoryStore, get_store


def client():
    fresh = MemoryStore()
    app.dependency_overrides[get_store] = lambda: fresh
    return TestClient(app)


def start(c, **kw):
    body = {"child_id": "kid1", "topic_id": "joy", "level": "basic", "day": "2026-11-21", **kw}
    return c.post("/walks", json=body).json()


def test_full_walk_and_sticker_once_per_day():
    c = client()
    walk = start(c)
    wid = walk["id"]

    # 학습 1
    lesson = c.get("/lessons/emotion/joy").json()
    assert set(lesson["words"]) == {"기뻐요", "슬퍼요"} and not lesson["multiple"]
    wrong = c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": ["슬퍼요"]}).json()
    assert not wrong["correct"] and wrong["feedback"]
    assert c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": ["기뻐요"]}).json()["correct"]

    # 학습 2 (카메라 없이 터치)
    assert c.post(f"/lessons/mirror/walks/{wid}/record", json={"mode": "touch"}).json()["step"] == 2

    # 학습 3
    assert c.get("/lessons/story/joy").json()["title"] == "바람 우체국의 첫 편지"
    assert c.post(f"/lessons/story/walks/{wid}/action", json={"action_index": 1}).status_code == 200
    talk = c.post(f"/lessons/story/walks/{wid}/talk").json()
    t1 = c.post(f"/conversations/{talk['conversation_id']}/turn", json={"choice_index": 0}).json()
    assert not t1["finished"] and t1["choices"]
    t2 = c.post(f"/conversations/{talk['conversation_id']}/turn", json={"choice_index": 1}).json()
    assert t2["finished"]

    done = c.post(f"/walks/{wid}/complete").json()
    assert done["sticker_given"] and done["sticker_count"] == 1

    # 같은 날 다시 하기 → 스티커 추가 없음
    again = start(c)
    assert not c.post(f"/walks/{again['id']}/complete").json()["sticker_given"]
    # 복습 → 스티커 없음
    review = start(c, day="2026-11-22", review=True)
    assert not c.post(f"/walks/{review['id']}/complete").json()["sticker_given"]


def test_expand_level_accepts_one_or_both_matching_words():
    c = client()
    wid = start(c, level="expand")["id"]
    assert c.get("/lessons/emotion/joy?level=expand").json()["multiple"]
    answer = lambda words: c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": words}).json()
    assert answer(["기뻐요"])["correct"]
    assert answer(["즐거워요"])["correct"]
    assert answer(["기뻐요", "즐거워요"])["correct"]


def test_expand_level_rejects_opposite_word_mixed_in():
    c = client()
    wid = start(c, level="expand")["id"]
    answer = lambda words: c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": words}).json()
    mixed = answer(["기뻐요", "슬퍼요"])
    assert not mixed["correct"] and mixed["feedback"]
    assert not answer(["기뻐요", "즐거워요", "슬퍼요"])["correct"]
    assert not answer(["슬퍼요"])["correct"]
    assert c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": []}).status_code == 422


def test_voice_text_matches_choice_and_masks_phone():
    c = client()
    wid = start(c)["id"]
    cid = c.post(f"/lessons/story/walks/{wid}/talk").json()["conversation_id"]
    r = c.post(f"/conversations/{cid}/turn", json={"text": "같이 놀자", "input_mode": "voice"}).json()
    assert r["reply"] and not r["fallback_to_picture"]
    miss = c.post(f"/conversations/{cid}/turn", json={"text": "내 번호는 010-1234-5678", "input_mode": "voice"}).json()
    assert miss["fallback_to_picture"]


def test_finished_walk_rejects_more_records():
    c = client()
    wid = start(c)["id"]
    c.post(f"/walks/{wid}/complete")
    assert c.post(f"/lessons/mirror/walks/{wid}/record", json={"mode": "touch"}).status_code == 409
