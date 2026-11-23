import json
import logging
import time

import pytest

from fastapi.testclient import TestClient

from app import config
from app.content import tales
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


def llm(reply=GENERATED, match=None, off_topic=False, expression="neutral"):
    """모델이 돌려주는 JSON (RESPONSE_SCHEMA)."""
    return json.dumps({"match": match, "offTopic": off_topic, "reply": reply, "expression": expression},
                      ensure_ascii=False)


def fallback_turn(input_mode="voice"):
    return {"said": None, "reply": None, "input_mode": input_mode, "resolved_by": "fallback"}


class FakeAzure:
    """URL로 서비스를 구분해 가짜 응답을 돌려준다. 값이 Exception이면 던지고, 함수면 불러서 쓴다.
    실제 post_json처럼 마감이 지났으면 부르지 않고 TimeoutError를 던진다."""

    def __init__(self, pii=None, safety=(0, 0), reply=None, replies=None):
        """safety: 호출 순서대로 심각도(Violence) 또는 {범주: 심각도}. replies: 모델 응답을 순서대로."""
        self.calls, self.bodies = [], []
        self.pii, self.safety = pii, list(safety)
        self.replies = list(replies) if replies is not None else None
        self.reply = llm() if reply is None else reply

    def __call__(self, url, headers, body, deadline=None):
        assert deadline is not None
        if deadline <= time.monotonic():
            raise TimeoutError("마감 시간이 지났어요.")
        kind = "language" if "/language/" in url else "safety" if "/contentsafety/" in url else "openai"
        self.calls.append(kind)
        self.bodies.append(body)
        if kind == "openai":
            answer = self.replies.pop(0) if self.replies is not None else self.reply
        else:
            answer = {"language": lambda: self.pii, "safety": lambda: self.safety.pop(0)}[kind]()
        if callable(answer) and not isinstance(answer, type):
            answer = answer()
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


def talk(c, topic_id="joy", character=None):
    wid = start(c, topic_id=topic_id)["id"]
    body = {"json": {"character": character}} if character else {}
    return c.post(f"/lessons/story/walks/{wid}/talk", **body).json()["conversation_id"]


def say(c, conv_id, text=RAW):
    return c.post(f"/conversations/{conv_id}/turn", json={"text": text, "input_mode": "voice"}).json()


@pytest.fixture
def with_keys(monkeypatch):
    monkeypatch.setattr(config, "settings", KEYS)


def use(monkeypatch, fake):
    monkeypatch.setattr(azure, "post_json", fake)
    return fake


JOY = tales()["joy"]["talk"]


# ---------- 키 없음, 순서, 요청 모양 ----------
def test_no_keys_falls_back_to_pictures_without_calls():
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    out = say(c, conv_id)
    assert out["fallback_to_picture"] and out["choices"]
    assert store.conversations[conv_id]["turns"] == [fallback_turn()]
    assert c.get("/health").json() == {"ok": True, "openai": False, "language": False, "content_safety": False,
                                         "store": "memory", "auth": False}


def test_health_shows_each_service(with_keys):
    assert client().get("/health").json() == {"ok": True, "openai": True, "language": True, "content_safety": True,
                                                    "store": "memory", "auth": False}


def test_model_reply_runs_in_order_and_sends_the_json_request(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(pii="내 번호는 *************이고 ************ 이야. 비행기 날리자"))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    out = say(c, conv_id)
    assert out == {"reply": GENERATED, "finished": False, "ask": JOY["again"], "choices": JOY["extra"],
                   "fallback_to_picture": False, "expression": "neutral"}
    assert fake.calls == ["language", "safety", "openai", "safety"]
    assert fake.bodies[3]["text"] == GENERATED  # 모델이 만든 말만 출력 검사
    request = fake.bodies[2]
    assert (request["temperature"], request["max_tokens"]) == (0.3, 150)
    assert request["response_format"]["json_schema"]["schema"] == prompts.RESPONSE_SCHEMA
    assert request["response_format"]["json_schema"]["strict"] is True
    sent = json.dumps(request["messages"], ensure_ascii=False)
    assert "010-1234-5678" not in sent and "kid@test.com" not in sent
    turn = store.conversations[conv_id]["turns"][0]
    assert turn["resolved_by"] == "llm" and turn["reply"] == GENERATED and "010-1234-5678" not in turn["said"]


def test_messages_name_the_friend_and_show_the_choices_of_that_turn():
    tale = tales()["anger"]
    first = prompts.build_messages(tale, 0, "보리", "말로 해서 좋았어")
    system, user = first[0]["content"], first[1]
    assert user == {"role": "user", "content": "말로 해서 좋았어"}
    assert "숲 친구 보리" in system and "{친구}" not in system
    assert tale["talk"]["ask"].replace("{친구}", "보리") in system
    assert f"0: {tale['talk']['choices'][0]}" in system and f"1: {tale['talk']['choices'][1]}" in system
    second = prompts.build_messages(tale, 1, "라온이", "또 타자")[0]["content"]
    assert tale["talk"]["again"] in second and f"0: {tale['talk']['extra'][0]}" in second
    for rule in ("1~2문장", "질문은 많아야 1개", "반말", "비유, 반어, 농담, 관용구", "장면 밖의 주제", "개인정보"):
        assert rule in system, rule


def test_friend_name_follows_the_chosen_friend(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure())
    c = client()
    say(c, talk(c, character="bear"))
    assert "숲 친구 두리" in fake.bodies[2]["messages"][0]["content"]


def test_response_schema_is_strict():
    schema = prompts.RESPONSE_SCHEMA
    assert schema["required"] == ["match", "offTopic", "reply", "expression"]
    assert set(schema["properties"]) == set(schema["required"]) and schema["additionalProperties"] is False


# ---------- match · offTopic · reply ----------
@pytest.mark.parametrize("turn_index", [0, 1])
def test_match_uses_the_script_line_and_its_face(monkeypatch, with_keys, turn_index):
    fake = use(monkeypatch, FakeAzure(reply=llm(reply="모델 말", match=1, expression="anger")))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c, "sad")
    sad = tales()["sad"]["talk"]
    if turn_index == 1:
        c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 0})
    out = say(c, conv_id, "음 같이 있고 싶어")
    lines, faces = (sad["replies"], sad["replyExpressions"]) if turn_index == 0 else (sad["ends"], sad["endExpressions"])
    assert (out["reply"], out["expression"]) == (lines[1], faces[1])  # 모델 말·표정이 아니라 대본
    assert fake.calls[-2:] == ["safety", "openai"]  # 대본 답은 출력 검사를 하지 않음
    turn = store.conversations[conv_id]["turns"][-1]
    assert turn == {"said": "음 같이 있고 싶어", "reply": lines[1], "input_mode": "voice", "resolved_by": "llm"}


@pytest.mark.parametrize("output", [
    llm(reply=None, off_topic=True),  # 이야기 밖
    llm(reply="그건 잘 모르겠어.", off_topic=True),  # 이야기 밖이면 reply가 있어도 쓰지 않음
    llm(reply=None),  # match도 reply도 없음
])
def test_off_topic_or_empty_answer_falls_back_without_storing_words(monkeypatch, with_keys, output):
    use(monkeypatch, FakeAzure(reply=output))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    out = say(c, conv_id, "오늘 저녁은 뭐 먹어")
    assert out["fallback_to_picture"] and out["expression"] is None
    conv = store.conversations[conv_id]
    assert conv["turns"] == [fallback_turn()] and conv["turn"] == 0
    assert "저녁" not in json.dumps(conv, ensure_ascii=False)


def test_model_expression_is_used_and_unknown_one_becomes_neutral(monkeypatch, with_keys):
    use(monkeypatch, FakeAzure(safety=(0,) * 4, replies=[llm(expression="surprise"), llm(expression="excited")]))
    c = client()
    conv_id = talk(c)
    assert say(c, conv_id)["expression"] == "surprise"
    assert say(c, conv_id)["expression"] == "neutral"


# ---------- 형식 오류는 한 번 다시 (4초 안에서) ----------
@pytest.mark.parametrize("bad", ["좋아!", "{}", llm()[:-1], json.dumps({"match": 2, "offTopic": False, "reply": None,
                                                                      "expression": "joy"}),
                                 json.dumps({"match": None, "offTopic": "no", "reply": "응", "expression": "joy"}),
                                 json.dumps({"match": True, "offTopic": False, "reply": None, "expression": "joy"})])
def test_wrong_format_is_asked_once_more(monkeypatch, with_keys, bad):
    fake = use(monkeypatch, FakeAzure(replies=[bad, llm()]))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    out = say(c, conv_id)
    assert out["reply"] == GENERATED and fake.calls.count("openai") == 2
    assert store.conversations[conv_id]["generated"] == {str(conversation_day()): 2}  # 다시 부른 것도 셈


def conversation_day():
    from app.deps import today_kst

    return today_kst()


def test_wrong_format_twice_falls_back(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(replies=["아니", "{\"match\": 0}"]))
    c = client()
    assert say(c, talk(c))["fallback_to_picture"]
    assert fake.calls.count("openai") == 2


def test_retry_only_while_the_turn_time_is_left(monkeypatch, with_keys):
    monkeypatch.setattr(conversation, "TURN_TIMEOUT", 0.3)

    def slow_bad():
        time.sleep(0.35)
        return "형식이 아님"

    fake = use(monkeypatch, FakeAzure(replies=[slow_bad, llm()]))
    c = client()
    began = time.monotonic()
    assert say(c, talk(c))["fallback_to_picture"]
    assert fake.calls.count("openai") == 1 and time.monotonic() - began < 1.5


def test_network_failure_is_not_retried(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(replies=[TimeoutError(), llm()]))
    c = client()
    assert say(c, talk(c))["fallback_to_picture"]
    assert fake.calls.count("openai") == 1


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
    assert time.monotonic() - began < 1.5  # 다시 부르지 않고 시간 안에 실패
    assert store.conversations[conv_id]["turns"] == [fallback_turn()]


# ---------- 보기와 같은 말, 보기 버튼 ----------
@pytest.mark.parametrize("text", [JOY["choices"][1], JOY["choices"][1].replace(" ", ""), JOY["choices"][1] + "!!"])
def test_words_same_as_a_choice_use_the_script_without_the_model(monkeypatch, with_keys, text):
    fake = use(monkeypatch, FakeAzure())
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    out = say(c, conv_id, text)
    assert (out["reply"], out["expression"]) == (JOY["replies"][1], JOY["replyExpressions"][1])
    assert "openai" not in fake.calls
    assert store.conversations[conv_id]["turns"][0] == {"said": JOY["choices"][1], "reply": JOY["replies"][1],
                                                        "input_mode": "voice", "resolved_by": "exact"}


def test_choice_index_is_button_when_tapped_and_exact_when_heard():
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 0, "input_mode": "voice"})  # 기기에서 알아들음
    c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 1, "input_mode": "picture"})
    assert [t["resolved_by"] for t in store.conversations[conv_id]["turns"]] == ["exact", "button"]


# ---------- 안전 검사 ----------
def test_blocked_input_skips_generation_and_records_only_categories(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(safety=({"Violence": 4, "Hate": 0},)))
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    assert say(c, conv_id)["fallback_to_picture"]
    assert fake.calls == ["language", "safety"]
    conv = store.conversations[conv_id]
    assert conv["safety"] == [{"blocked": True, "categories": ["Violence"]}] and conv["turns"] == [fallback_turn()]


@pytest.mark.parametrize("text", ["짜증나", "때리고 싶어"])
def test_anger_feelings_from_child_pass_input_check(monkeypatch, with_keys, text):
    reply = "화가 많이 났구나. 같이 숨을 크게 쉬어 보자."
    fake = use(monkeypatch, FakeAzure(safety=(2, 0), reply=llm(reply=reply)))  # 아이 입력 심각도 2는 통과
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c, "anger")
    out = say(c, conv_id, text)
    assert out["reply"] == reply and not out["fallback_to_picture"]
    assert fake.calls == ["language", "safety", "openai", "safety"]
    assert store.conversations[conv_id]["safety"] == []


def test_blocked_output_is_not_shown_or_saved(monkeypatch, with_keys):
    fake = use(monkeypatch, FakeAzure(safety=(0, {"Violence": 2, "SelfHarm": 2})))  # 모델 말은 0 초과면 막음
    store = MemoryStore()
    c = client(store)
    conv_id = talk(c)
    out = say(c, conv_id)
    assert out["fallback_to_picture"] and GENERATED not in out["reply"]
    assert fake.calls == ["language", "safety", "openai", "safety"]
    conv = store.conversations[conv_id]
    assert conv["turns"] == [fallback_turn()]
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


# ---------- 코드 검사: 문장 수, 질문 수, 길이(60자), 금지어 ----------
@pytest.mark.parametrize("reply", [
    "좋아! 같이 접자. 내일도 하자.",  # 세 문장
    "어디로 날릴까? 언덕은 어때?",  # 질문 두 개
    "바람이 아주 멀리멀리 불어서 우리 비행기가 숲 끝까지 날아가고 또 날아가서 하늘 위 구름까지 닿으면 정말 좋겠다.",  # 60자 넘음
    "그것도 모르다니 바보 같아.",  # 금지어
    "",
])
def test_unsuitable_model_reply_falls_back(monkeypatch, with_keys, reply):
    use(monkeypatch, FakeAzure(reply=llm(reply=reply)))
    c = client()
    assert say(c, talk(c))["fallback_to_picture"]


@pytest.mark.parametrize("reply, expected", [
    (GENERATED, GENERATED),
    ("좋아! 다음 비행기는 우리 함께 접자.", "좋아! 다음 비행기는 우리 함께 접자."),  # 두 문장
    ("멀리 날아갔구나. 어디까지 갔을까?", "멀리 날아갔구나. 어디까지 갔을까?"),  # 질문 하나
    ("“나도 기뻐.”", "나도 기뻐."),  # 따옴표는 뗌
    ("나도\n기뻐.", "나도 기뻐."),  # 줄바꿈은 한 칸으로
])
def test_check_reply_counts_only_sentences_questions_length_and_words(reply, expected):
    assert prompts.check_reply(reply) == expected


# ---------- 개인정보, 설정 ----------
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


# ---------- 친구 표정 (대본) ----------
def test_script_replies_carry_the_expression_of_each_line():
    sad = tales()["sad"]["talk"]
    c = client()
    conv_id = talk(c, topic_id="sad")
    first = c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 0, "input_mode": "picture"}).json()
    assert (first["reply"], first["expression"]) == (sad["replies"][0], sad["replyExpressions"][0])
    end = c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 1, "input_mode": "picture"}).json()
    assert end["finished"] and end["expression"] == sad["endExpressions"][1]


def test_fallback_has_no_expression():
    c = client()
    out = say(c, talk(c))
    assert out["fallback_to_picture"] and out["expression"] is None


def test_end_reports_answered_turns_only():
    c = client()
    conv_id = talk(c)
    say(c, conv_id)  # 키 없음 → 그림으로
    c.post(f"/conversations/{conv_id}/turn", json={"choice_index": 0})
    assert c.post(f"/conversations/{conv_id}/end").json() == {"ended_by": "button", "turns": 1}
