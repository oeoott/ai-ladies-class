"""레벨 테스트 저장과 보호자 리포트 (백엔드 1)."""
import json

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import azure
from app.store import MemoryStore, get_store
from app.store_cosmos import CosmosStore

from .fake_cosmos import FakeDatabase
from .test_auth import CHILD, PASSWORD, SECRET

PLACEMENT = {"answers": [{"target": "joy", "picks": ["sad", "joy"], "used_hint": True},
                         {"target": "surprise", "picks": ["surprise"], "used_hint": False}], "level": "basic"}
SAID = "비행기가 하늘 끝까지 날아가면 좋겠어"


@pytest.fixture(autouse=True)
def with_secret(monkeypatch):
    monkeypatch.setattr(config, "settings", config.Settings(jwt_secret=SECRET))


@pytest.fixture(params=["memory", "cosmos"])
def c(request):
    store = MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app)
    app.dependency_overrides.clear()


def guardian(c, email="parent@example.com"):
    token = c.post("/auth/signup", json={"email": email, "password": PASSWORD}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    child_id = c.post("/children", json=CHILD, headers=headers).json()["id"]
    return headers, child_id


def walk(c, h, child_id, day, topic_id="joy", review=False, picks=(("기뻐요",),), mirror="camera", talk=(), done=True):
    wid = c.post("/walks", json={"child_id": child_id, "topic_id": topic_id, "day": day, "review": review},
                 headers=h).json()["id"]
    for i, selected in enumerate(picks):
        c.post(f"/lessons/emotion/walks/{wid}/answer", json={"selected": list(selected), "used_hint": i > 0}, headers=h)
    if mirror:
        c.post(f"/lessons/mirror/walks/{wid}/record", json={"mode": mirror, "score": None}, headers=h)
    if talk:
        conv = c.post(f"/lessons/story/walks/{wid}/talk", headers=h).json()["conversation_id"]
        for turn in talk:
            c.post(f"/conversations/{conv}/turn", json=turn, headers=h)
    if done:
        c.post(f"/walks/{wid}/complete", headers=h)
    return wid


# ---------- 레벨 테스트 ----------
def test_placement_saves_answers_and_level(c):
    h, child_id = guardian(c)
    assert c.get(f"/children/{child_id}/placement", headers=h).status_code == 404
    saved = c.post(f"/children/{child_id}/placement", json=PLACEMENT, headers=h)
    assert saved.status_code == 201
    again = {**PLACEMENT, "level": "expand"}
    c.post(f"/children/{child_id}/placement", json=again, headers=h)  # 다시 하기: 마지막 결과를 돌려준다
    got = c.get(f"/children/{child_id}/placement", headers=h).json()
    assert got["level"] == "expand" and got["answers"] == PLACEMENT["answers"] and got["created_at"]


def test_placement_works_for_device_child_and_checks_owner(c):
    assert c.post("/children/device-kid/placement", json=PLACEMENT).status_code == 201
    assert c.get("/children/device-kid/placement").json()["level"] == "basic"
    _, child_id = guardian(c, "owner@example.com")
    other, _ = guardian(c, "other@example.com")
    assert c.post(f"/children/{child_id}/placement", json=PLACEMENT, headers=other).status_code == 403
    assert c.post(f"/children/{child_id}/placement", json=PLACEMENT).status_code == 401


@pytest.mark.parametrize("body", [
    {"answers": [], "level": "basic"},
    {"answers": [{"target": "joy", "picks": [], "used_hint": False}], "level": "basic"},
    {"answers": [{"target": "joy", "picks": ["joy"]}], "level": "hard"},
    {**PLACEMENT, "name": "김하늘"},
])
def test_placement_checks_input(c, body):
    assert c.post("/children/device-kid/placement", json=body).status_code == 422


# ---------- 리포트 ----------
def test_report_numbers(c, monkeypatch):
    h, child_id = guardian(c)
    # 기쁨: 답 2번(오답 → 단서 보고 정답), 카메라, 그림으로 대화 2턴
    walk(c, h, child_id, "2026-11-20", picks=(("슬퍼요",), ("기뻐요",)), mirror="camera",
         talk=({"choice_index": 0, "input_mode": "picture"}, {"choice_index": 1, "input_mode": "picture"}))
    # 화남: 답 1번 정답, 터치, 말로 1턴(키 없음 → 그림으로 돌아감) + 그림 1턴
    walk(c, h, child_id, "2026-11-21", topic_id="anger", picks=(("화나요",),), mirror="touch",
         talk=({"text": SAID, "input_mode": "voice"}, {"choice_index": 0, "input_mode": "picture"}))
    # 같은 날 복습: 스티커 없음, 복습 수로 센다
    walk(c, h, child_id, "2026-11-21", review=True, mirror="touch")
    # 마치지 않은 산책: 완료 수에는 없고 기록은 센다
    walk(c, h, child_id, "2026-11-22", picks=(("기뻐요",),), mirror=None, done=False)

    r = c.get(f"/children/{child_id}/report?from=2026-11-20&to=2026-11-22", headers=h).json()
    assert r["from_day"] == "2026-11-20" and r["to_day"] == "2026-11-22"
    assert r["walks"] == {"completed": 2, "reviews": 1}
    joy, surprise, sad, anger = r["emotion"]
    assert joy == {"topic_id": "joy", "label": joy["label"], "answers": 4, "correct": 3, "accuracy": 0.75, "hint_used": 1}
    assert anger["answers"] == 1 and anger["accuracy"] == 1.0 and anger["hint_used"] == 0
    assert surprise["answers"] == 0 and surprise["accuracy"] is None
    assert r["mirror"] == {"records": 3, "camera": 1, "touch": 2, "camera_ratio": 0.33, "touch_ratio": 0.67}
    assert r["story"] == {"conversations": 2, "turns": 3, "voice_turns": 0, "voice_ratio": 0.0,
                          "fallback_to_picture": 1, "blocked": 0, "generation_limited": 0,
                          "resolved_by": {"button": 3, "exact": 0, "llm": 0, "fallback": 1}}
    assert r["sticker_days"] == ["2026-11-20", "2026-11-21"]


def test_report_counts_voice_turns_and_blocks(c, monkeypatch):
    from .test_conversation_ai import KEYS, FakeAzure

    monkeypatch.setattr(config, "settings", config.Settings(**{**KEYS.__dict__, "jwt_secret": SECRET}))
    h, child_id = guardian(c)
    monkeypatch.setattr(azure, "post_json", FakeAzure(safety=(0, 0, {"Violence": 6})))
    walk(c, h, child_id, "2026-11-20", talk=({"text": SAID, "input_mode": "voice"},  # 생성 성공
                                              {"text": SAID, "input_mode": "voice"}))  # 입력 차단 → 그림으로
    r = c.get(f"/children/{child_id}/report?from=2026-11-20&to=2026-11-20", headers=h).json()
    assert r["story"] == {"conversations": 1, "turns": 1, "voice_turns": 1, "voice_ratio": 1.0,
                          "fallback_to_picture": 1, "blocked": 1, "generation_limited": 0,
                          "resolved_by": {"button": 0, "exact": 0, "llm": 1, "fallback": 1}}
    text = json.dumps(r, ensure_ascii=False)
    assert SAID not in text and "바람을 타고" not in text and "said" not in text and "reply" not in text


def test_report_period_filters_by_walk_day(c):
    h, child_id = guardian(c)
    walk(c, h, child_id, "2026-11-01")
    walk(c, h, child_id, "2026-11-21")
    r = c.get(f"/children/{child_id}/report?from=2026-11-10&to=2026-11-30", headers=h).json()
    assert r["walks"]["completed"] == 1 and r["sticker_days"] == ["2026-11-21"] and r["emotion"][0]["answers"] == 1
    default = c.get(f"/children/{child_id}/report", headers=h)
    assert default.status_code == 200
    days = default.json()
    from datetime import date
    assert (date.fromisoformat(days["to_day"]) - date.fromisoformat(days["from_day"])).days == 29


@pytest.mark.parametrize("query", ["from=2026-11-22&to=2026-11-21", "from=2025-01-01&to=2026-11-21", "from=nope"])
def test_report_rejects_bad_period(c, query):
    h, child_id = guardian(c)
    assert c.get(f"/children/{child_id}/report?{query}", headers=h).status_code == 422


def test_report_needs_owner_token(c):
    h, child_id = guardian(c, "owner@example.com")
    other, _ = guardian(c, "other@example.com")
    assert c.get(f"/children/{child_id}/report").status_code == 401
    assert c.get(f"/children/{child_id}/report", headers=other).status_code == 403
    assert c.get("/children/device-kid/report").status_code == 401  # 기기 기록도 토큰 없이는 못 본다
    assert c.get("/children/device-kid/report", headers=h).status_code == 403
    assert c.get(f"/children/{child_id}/report", headers=h).status_code == 200


# ---------- 월별 산책 수 ----------
def test_monthly_counts_sticker_days_per_month(c):
    h, child_id = guardian(c)
    for day in ["2026-06-30", "2026-07-01", "2026-07-02", "2026-11-03", "2026-12-01"]:
        walk(c, h, child_id, day)
    walk(c, h, child_id, "2026-11-03", review=True)  # 같은 날 복습: 날 수는 그대로
    walk(c, h, child_id, "2026-11-05", done=False)  # 마치지 않은 산책: 스티커 없음
    r = c.get(f"/children/{child_id}/report/monthly?to=2026-11&months=6", headers=h)
    assert r.status_code == 200
    assert r.json()["months"] == [
        {"month": "2026-06", "walks": 1}, {"month": "2026-07", "walks": 2}, {"month": "2026-08", "walks": 0},
        {"month": "2026-09", "walks": 0}, {"month": "2026-10", "walks": 0}, {"month": "2026-11", "walks": 1},
    ]
    # 해가 바뀌는 범위, 기본 6개월
    jan = c.get(f"/children/{child_id}/report/monthly?to=2027-01", headers=h).json()["months"]
    assert [m["month"] for m in jan] == ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]
    assert jan[4]["walks"] == 1


@pytest.mark.parametrize("query", ["to=2026-13", "to=2026-1", "months=0", "months=25"])
def test_monthly_rejects_bad_query(c, query):
    h, child_id = guardian(c)
    assert c.get(f"/children/{child_id}/report/monthly?{query}", headers=h).status_code == 422


def test_monthly_needs_owner_token(c):
    h, child_id = guardian(c)
    other, _ = guardian(c, "other@example.com")
    assert c.get(f"/children/{child_id}/report/monthly").status_code == 401
    assert c.get(f"/children/{child_id}/report/monthly", headers=other).status_code == 403
    assert c.get("/children/device-kid/report/monthly").status_code == 401


def test_report_reads_conversations_saved_before_resolved_by():
    """이전 문서: 턴에 resolved_by가 없고, 그림으로 돌아간 수는 fallbacks 칸에 있다."""
    from datetime import date

    from app.services.report import build_report
    from app.store import MemoryStore

    store = MemoryStore()
    walk = store.create_walk(child_id="kid", topic_id="joy", level="basic", day=date(2026, 11, 20), review=False)
    conv = store.create_conversation(walk)
    conv.update(turn=2, fallbacks=2, turns=[{"said": "같이 놀자!", "reply": "…", "input_mode": "picture"},
                                           {"said": "꽃을 그리자.", "reply": "…", "input_mode": "voice"}])
    store.save_conversation(conv)
    story = build_report(store, "kid", date(2026, 11, 20), date(2026, 11, 20)).story
    assert (story.turns, story.voice_turns, story.fallback_to_picture) == (2, 1, 2)
    assert story.resolved_by.model_dump() == {"button": 0, "exact": 0, "llm": 0, "fallback": 0}
