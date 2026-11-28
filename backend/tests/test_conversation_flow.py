"""학습 3 대화 보완 (AI 파트): 형식 검사, 고른 행동·이전 턴 문맥, 마지막 턴, 끝난 산책, 동시 요청, 안전 정책.
모델 응답은 모두 가짜 JSON이다 (실제 Azure 호출 없음)."""
import json
import threading

import pytest

from app import config
from app.content import tales
from app.services import conversation, prompts

from .test_conversation_ai import FakeAzure, KEYS, client, llm, say, use, with_keys  # noqa: F401 (fixture)
from .test_walk_flow import start


# ---------- 형식 검사: match는 정수 0·1만 ----------
@pytest.mark.parametrize("match", [0.0, 1.0, "0", "1", True, False, -1, 2, [0]])
def test_parse_rejects_match_that_is_not_integer_0_or_1(match):
    content = json.dumps({"match": match, "offTopic": False, "reply": None, "expression": "joy"})
    assert prompts.parse(content) is None


def test_float_match_is_asked_again_instead_of_crashing(monkeypatch, with_keys):
    bad = json.dumps({"match": 0.0, "offTopic": False, "reply": None, "expression": "joy"})
    fake = use(monkeypatch, FakeAzure(replies=[bad, llm(match=0)]))
    c = client()
    wid = start(c)["id"]
    conv_id = c.post(f"/lessons/story/walks/{wid}/talk").json()["conversation_id"]
    out = say(c, conv_id, "같이 놀고 싶어")
    assert out["reply"] == tales()["joy"]["talk"]["replies"][0]
    assert fake.calls.count("openai") == 2
