"""학습 3 평가 입력(docs/ai/eval/talk_cases.json) 검사. 모델 응답은 가짜다 (실제 평가는 scripts/eval_talk.py).

1. 형식: 동화별 20개, 종류별 개수, 기대값 모양, 보기와 글자가 같은 입력은 없음(그러면 모델을 부르지 않음)
2. 연결: 모델이 기대대로 답한다고 가정하고 실제 대화 엔진을 돌려 결과(대본·생성·그림)가 기대와 같은지
"""
import json
from collections import Counter
from pathlib import Path

import pytest

from app.content import tales
from app.services import conversation
from scripts import eval_talk

from .test_conversation_ai import FakeAzure, llm, use, with_keys  # noqa: F401 (fixture)

DOC = json.loads((Path(__file__).resolve().parents[2] / "docs/ai/eval/talk_cases.json").read_text(encoding="utf-8"))
CASES = DOC["cases"]


def test_twenty_cases_per_tale_with_every_kind():
    assert Counter(c["tale"] for c in CASES) == {t: 20 for t in tales()}
    for tale in tales():
        kinds = Counter(c["kind"] for c in CASES if c["tale"] == tale)
        assert kinds == {"match": 6, "story": 5, "offtopic": 4, "pii": 3, "unsafe": 2}, tale
    assert len({c["id"] for c in CASES}) == len(CASES)


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_case_shape(case):
    assert case["turn"] in (0, 1) and isinstance(case["text"], str) and case["text"]
    exp = case["expect"]
    if case["kind"] == "match":
        assert exp["match"] in (0, 1) and exp["outcome"] == "script"
    else:
        assert exp["match"] is None
    choices = conversation._script(tales()[case["tale"]]["talk"], case["turn"])[0]
    assert conversation._match_text(case["text"], choices) is None, "보기와 글자가 같으면 모델을 부르지 않는다"


def fake_model_answer(case):
    exp = case["expect"]
    if case["kind"] == "story" or exp["outcome"].startswith("generated"):
        reply = "멀리 갔구나." if case["turn"] == 0 else "함께 그렸어요."
        return llm(reply=reply)
    return llm(reply=None, match=exp["match"], off_topic=bool(exp.get("offTopic", True)))


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_engine_routes_each_case_as_expected_with_a_model_that_answers_as_expected(monkeypatch, with_keys, case):
    blocked = case["expect"].get("blocked_input", False)
    fake = use(monkeypatch, FakeAzure(safety=(4 if blocked else 0, 0), reply=fake_model_answer(case)))
    row = eval_talk.run_case(case)
    assert row["ok"]["outcome"], row
    assert ("openai" in fake.calls) is (not blocked)
    if row["outcome"] == "script":
        talk = tales()[case["tale"]]["talk"]
        lines = talk["replies"] if case["turn"] == 0 else talk["ends"]
        assert row["reply"] == lines[case["expect"]["match"]]


def test_summary_counts():
    rows = [{"ok": {"match": True, "outcome": True}, "seconds": 1.0, "format_error": False, "blocked": False},
            {"ok": {"match": False, "outcome": True, "offTopic": True}, "seconds": 5.0, "format_error": True,
             "blocked": True}]
    s = eval_talk.summarize(rows)
    assert s["match"] == {"correct": 1, "total": 2, "rate": 0.5} and s["format_errors"] == 1
    assert s["over_turn_timeout"] == 1 and s["seconds_p50"] == 3.0


def test_dry_run_needs_no_keys(capsys):
    assert eval_talk.main(["--dry-run", "--tale", "anger", "--limit", "1"]) == 0
    assert "아이가 고른 행동" in capsys.readouterr().out


def test_real_run_without_keys_stops_without_calls(capsys):
    assert eval_talk.main(["--limit", "1"]) == 2
