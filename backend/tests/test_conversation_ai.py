import json
import logging
import time

import pytest

from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import azure, conversation, prompts
from app.store import MemoryStore, get_store

from .test_walk_flow import start

REAL_POST_JSON = azure.post_json  # conftest가 가짜로 바꾸기 전의 함수

RAW = "내 번호는 010-1234-5678이고 kid@test.com 이야. 비행기 날리자"
GENERATED = "바람을 타고 멀리 날아가면 좋겠다."
KEYS = config.Settings(
    openai_endpoint="https://ai.example", openai_key="k1", openai_deployment="chat",
    language_endpoint="https://lang.example", language_key="k2",
    safety_endpoint="https://safe.example", safety_key="k3",
)


class FakeAzure:
    """URL로 서비스를 구분해 가짜 응답을 돌려준다. 값이 Exception이면 던진다."""

    def __init__(self, pii=None, safety=(0, 0), reply=GENERATED):
        """safety: 호출 순서대로 심각도(Violence) 또는 {범주: 심각도}."""
        self.calls, self.bodies = [], []
        self.pii, self.safety, self.reply = pii, list(safety), reply

    def __call__(self, url, headers, body, deadline=None):
        assert deadline is not None and deadline > time.monotonic()
        kind = "language" if "/language/" in url else "safety" if "/contentsafety/" in url else "openai"
        self.calls.append(kind)
        self.bodies.append(body)
        answer = {"language": lambda: self.pii, "safety": lambda: self.safety.pop(0),
                  "openai": lambda: self.reply}[kind]()
        if isinstance(answer, Exception):
            raise answer
        if kind == "language":
            text = body["analysisInput"]["documents"][0]["text"]
            return {"results": {"documents": [{"redactedText": answer or text}]}}
        if kind == "safety":
            scores = answer if isinstance(answer, dict) else {"Violence": answer}
            return {"categoriesAnalysis": [{"category": k, "severity": v} for k, v in scores.items()]}
        return {"choices": [{"message": {"content": answer}}]}


def client(store=None):
    store = store or MemoryStore()
    app.dependency_overrides[get_store] = lambda: store
    return TestClient(app)


def talk(c, topic_id="joy"):
    wid = start(c, topic_id=topic_id)["id"]
    return c.post(f"/lessons/story/walks/{wid}/talk").json()["conversation_id"]


def say(c, conv_id, text=RAW):
    return c.post(f"/conversations/{conv_id}/turn", json={"text": text, "input_mode": "voice"}).json()


@pytest.fixture
def with_keys(monkeypatch):
    monkeypatch.setattr(config, "settings", KEYS)


def use(monkeypatch, fake):
    monkeypatch.setattr(azure, "post_json", fake)
    return fake


def test_no_keys_falls_back_to_pictures_without_calls():
    c = client()
    out = say(c, talk(c))
    assert out["fallback_to_picture"] and out["choices"]
    assert c.get("/health").json() == {"ok": True, "openai": False, "language": False, "content_safety": False,
                                         "store": "memory", "auth": False}


def test_health_shows_each_service(with_keys):
    assert client().get("/health").json() == {"ok": True, "openai": True, "language": True, "content_safety": True,
                                                    "store": "memory", "auth": False}


def test_generated_reply_runs_in_order(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(pii="내 번호는 *************이고 ************ 이야. 비행기 날리자"))
    c = client()
    out = say(c, talk(c))
    assert out == {"reply": GENERATED, "finished": False, "ask": "다음 초대장에는 무엇을 담을까요?",
                   "choices": ["꽃을 그리자.", "하트를 그리자."], "fallback_to_picture": False,
                   "expression": "neutral"}  # 표정 태그가 없는 응답은 neutral
    assert fake.calls == ["language", "safety", "openai", "safety"]
    assert fake.bodies[3]["text"] == GENERATED
    sent_to_openai = fake.bodies[2]["messages"][-1]["content"]
    assert "010-1234-5678" not in sent_to_openai and "kid@test.com" not in sent_to_openai


def test_slow_generation_hits_turn_time_limit(monkeypatch):
    monkeypatch.setattr(config, "settings", config.Settings(
        openai_endpoint="https://ai.example", openai_key="k1", openai_deployment="chat"))
    monkeypatch.setattr(conversation, "TURN_TIMEOUT", 0.3)
    monkeypatch.setattr(azure, "post_json", REAL_POST_JSON)
    monkeypatch.setattr(azure._client, "post", lambda *a, **k: time.sleep(2))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    began = time.monotonic()
    out = say(c, conv_id)
    assert out["fallback_to_picture"]
    assert time.monotonic() - began < 1.5  # 생성까지 가지 않고 시간 안에 실패
    assert store.conversations[conv_id]["turns"] == []


def test_blocked_input_skips_generation_and_records_only_categories(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(safety=({"Violence": 4, "Hate": 0},)))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    assert say(c, conv_id)["fallback_to_picture"]
    assert fake.calls == ["language", "safety"]
    conv = store.conversations[conv_id]
    assert conv["safety"] == [{"blocked": True, "categories": ["Violence"]}] and conv["turns"] == []


@pytest.mark.parametrize("text", ["짜증나", "때리고 싶어"])
def test_anger_feelings_from_child_pass_input_check(monkeypatch, with_keys, text):
    reply = "화가 날 땐 크게 숨을 쉬어 보자."
    fake = use(monkeypatch, FakeAzure(safety=(2, 0), reply=reply))  # 아이 입력 심각도 2는 통과
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c, "anger")
    out = say(c, conv_id, text)
    assert out["reply"] == reply and not out["fallback_to_picture"]
    assert fake.calls == ["language", "safety", "openai", "safety"]
    assert store.conversations[conv_id]["safety"] == []


def test_blocked_output_is_not_shown_or_saved(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(safety=(0, {"Violence": 2, "SelfHarm": 2})))  # 생성 응답은 0 초과면 막음
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    out = say(c, conv_id)
    assert out["fallback_to_picture"] and GENERATED not in out["reply"]
    assert fake.calls == ["language", "safety", "openai", "safety"]
    conv = store.conversations[conv_id]
    assert conv["turns"] == []
    assert conv["safety"] == [{"blocked": True, "categories": ["Violence", "SelfHarm"]}]
    assert GENERATED not in json.dumps(conv, ensure_ascii=False)


def test_safety_failure_blocks(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(safety=(TimeoutError(),)))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    assert say(c, conv_id)["fallback_to_picture"]
    assert "openai" not in fake.calls
    assert store.conversations[conv_id]["safety"] == [{"blocked": True, "categories": []}]


@pytest.mark.parametrize("reply", [
    "좋아! 같이 접자.",  # 두 문장
    "같이 접어요.",  # 존댓말
    "함께 접겠습니다.",  # 존댓말
    "바람이 아주 멀리멀리 불어서 우리 비행기가 숲 끝까지 날아가면 정말 좋겠다.",  # 너무 김
    "OK 좋아.",  # 영어
    "좋아 :)",  # 기호
    "그것도 모르다니 바보 같아.",  # 비속어·놀리는 말
    "\"좋아\"\n같이 하자.",  # 줄바꿈
])
def test_unsuitable_generated_reply_falls_back(monkeypatch, with_keys, reply):
    use(monkeypatch, FakeAzure(reply=reply))
    c = client()
    assert say(c, talk(c))["fallback_to_picture"]


@pytest.mark.parametrize("reply", [GENERATED, "다음 비행기는 우리 함께 접자.", "나도 초대해 줘서 기뻐", "같이 놀자!"])
def test_check_reply_accepts_short_casual_sentence(reply):
    assert prompts.check_reply(f"“{reply}”") == reply


def test_raw_text_is_never_stored_or_logged(monkeypatch, with_keys, caplog):
    use(monkeypatch, FakeAzure(pii=RuntimeError("language down")))  # PII 실패 → 로컬 규칙
    caplog.set_level(logging.DEBUG)
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    assert not say(c, conv_id)["fallback_to_picture"]
    saved = json.dumps([store.conversations, store.attempts], ensure_ascii=False, default=str)
    said = store.conversations[conv_id]["turns"][0]["said"]
    assert "[전화번호]" in said and "[이메일]" in said
    for raw in ("010-1234-5678", "kid@test.com", RAW):
        assert raw not in saved and raw not in caplog.text


def test_settings_read_environment_first_then_backend_env_file(tmp_path):
    env = tmp_path / ".env"
    env.write_text("AZURE_OPENAI_ENDPOINT=https://file.example/\nAZURE_OPENAI_KEY=file-key\n"
                   "AZURE_OPENAI_DEPLOYMENT=chat\n", encoding="utf-8")
    environ = {"AZURE_OPENAI_KEY": "app-setting-key", "AZURE_OPENAI_DEPLOYMENT": " ",
               "CORS_ORIGINS": "https://app.example, http://localhost:5173"}
    s = config.load_settings(env, environ)
    assert s.openai_key == "app-setting-key"  # 환경 변수 우선
    assert s.openai_endpoint == "https://file.example" and s.openai_deployment == "chat"  # 없거나 빈 값은 .env
    assert s.cors_origins == ["https://app.example", "http://localhost:5173"] and s.openai_enabled
    assert config.load_settings(tmp_path / "missing.env", {}) == config.Settings()


def test_tests_ignore_real_environment_and_env_file(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_KEY", "real-key")
    assert config.settings == config.Settings()



# ---------- 친구 표정 ----------
def test_generated_reply_brings_its_expression_and_safety_checks_only_the_sentence(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(reply="[surprise] 정말 멀리 날아갔구나."))
    c = client()
    out = say(c, talk(c))
    assert (out["reply"], out["expression"]) == ("정말 멀리 날아갔구나.", "surprise")
    assert fake.bodies[3]["text"] == "정말 멀리 날아갔구나."  # 출력 안전 검사에 태그는 넣지 않음
    assert "joy, surprise, sad, anger, neutral" in fake.bodies[2]["messages"][0]["content"]  # 모델에게 목록을 줌


@pytest.mark.parametrize("content, expected", [
    ("[joy] 나도 기뻐.", ("나도 기뻐.", "joy")),
    ("  [ SAD ]  조금 속상해.", ("조금 속상해.", "sad")),
    ("[happy] 나도 기뻐.", ("나도 기뻐.", "neutral")),  # 목록에 없는 표정
    ("[] 나도 기뻐.", ("나도 기뻐.", "neutral")),
    ("나도 기뻐.", ("나도 기뻐.", "neutral")),  # 태그 없음
    (None, (None, "neutral")),
])
def test_split_expression(content, expected):
    assert prompts.split_expression(content) == expected


def test_unknown_expression_tag_still_answers_with_neutral(monkeypatch, with_keys):
    use(monkeypatch, FakeAzure(reply="[excited] 같이 날려 보자."))
    c = client()
    out = say(c, talk(c))
    assert (out["reply"], out["expression"]) == ("같이 날려 보자.", "neutral")


def test_script_replies_carry_the_expression_of_each_line():
    c = client()
    conv_id = talk(c, topic_id="sad")
    first = c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 0, "input_mode": "picture"}).json()
    assert (first["reply"], first["expression"]) == ("응. 그 등대는 내가 처음 만든 거였어.", "sad")
    end = c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 1, "input_mode": "picture"}).json()
    assert end["finished"] and end["expression"] == "neutral"


def test_fallback_has_no_expression():
    c = client()
    out = say(c, talk(c))
    assert out["fallback_to_picture"] and out["expression"] is None
