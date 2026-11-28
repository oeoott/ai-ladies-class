"""학습 3 대화 평가: docs/ai/eval/talk_cases.json의 입력을 실제 대화 엔진(conversation.take_turn)으로 돌린다.

가짜 응답 검사(pytest tests/test_talk_eval_cases.py)와 다르게 이 도구는 **실제 Azure**를 부른다.
backend/.env 또는 환경 변수의 키를 쓰고, 키 값은 출력·저장하지 않는다.

    cd backend
    python -m scripts.eval_talk --dry-run                 # 키 없이 메시지 모양만 확인 (호출 없음)
    python -m scripts.eval_talk                           # .env의 배포로 전체 실행
    python -m scripts.eval_talk --deployment gpt-6.1-terra --out ../docs/ai/eval/results/terra.json
    python -m scripts.eval_talk --tale joy --limit 5      # 일부만

결과 JSON: 사례마다 모델 JSON(match·offTopic·reply·expression), 최종 결과(script·generated·fallback),
걸린 시간, 기대와 맞는지. 요약: match 정확도, offTopic 정확도, 결과 정확도, 형식 오류 수, 시간 p50·p95.
입력 문장은 평가용으로 만든 가짜 문장이다 (실제 아이 말 아님).
"""
import argparse
import dataclasses
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from app import config
from app.content import tales
from app.services import azure, conversation, prompts

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "docs" / "ai" / "eval" / "talk_cases.json"


def conv_for(case: dict) -> dict:
    """사례의 턴에 맞는 대화 문서. 2턴째는 첫 보기로 첫 턴을 마친 상태, 행동은 첫 번째를 고른 상태."""
    talk = tales()[case["tale"]]["talk"]
    turns = [] if case["turn"] == 0 else [{"said": talk["choices"][0], "reply": talk["replies"][0],
                                           "input_mode": "picture", "resolved_by": "button"}]
    return {"id": "eval", "child_id": "eval", "walk_id": "eval", "topic_id": case["tale"], "friend": "lion",
            "turn": case["turn"], "turns": turns, "safety": [], "generated": {}, "limited": 0, "actions": [0],
            "ended_by": None, "rev": 0}


def outcome_of(result: dict) -> str:
    if result.get("fallback"):
        return "fallback"
    return "generated" if result.get("generated") else "script"


def judge(case: dict, model: dict | None, outcome: str) -> dict:
    exp = case["expect"]
    ok_outcome = outcome in exp["outcome"].split("_or_") if "_or_" in exp["outcome"] else outcome == exp["outcome"]
    out = {"outcome": ok_outcome}
    if case["kind"] in ("match", "story") and model is not None:
        out["match"] = model["match"] == exp["match"]
    if exp.get("offTopic") is not None and model is not None:
        out["offTopic"] = model["offTopic"] == exp["offTopic"]
    return out


def run_case(case: dict) -> dict:
    captured = {}
    real = azure.post_json

    def spy(url, headers, body, deadline=None):
        data = real(url, headers, body, deadline)
        if "/chat/completions" in url:
            content = data["choices"][0]["message"]["content"]
            captured["raw"] = content
            captured["parsed"] = prompts.parse(content)
        return data

    azure.post_json = spy
    began = time.monotonic()
    try:
        conv = conv_for(case)
        result = conversation.take_turn(conv, None, case["text"], "voice", day="eval")
    finally:
        azure.post_json = real
    took = time.monotonic() - began
    outcome = outcome_of(result)
    model = captured.get("parsed")
    return {"id": case["id"], "kind": case["kind"], "turn": case["turn"], "text": case["text"],
            "model": model, "format_error": "raw" in captured and model is None,
            "blocked": bool(conv["safety"]), "outcome": outcome, "reply": result.get("reply"),
            "seconds": round(took, 3), "ok": judge(case, model, outcome)}


def summarize(rows: list[dict]) -> dict:
    def rate(key):
        vals = [r["ok"][key] for r in rows if key in r["ok"]]
        return {"correct": sum(vals), "total": len(vals), "rate": round(sum(vals) / len(vals), 3) if vals else None}

    times = sorted(r["seconds"] for r in rows)
    return {"cases": len(rows), "match": rate("match"), "offTopic": rate("offTopic"), "outcome": rate("outcome"),
            "format_errors": sum(r["format_error"] for r in rows), "blocked": sum(r["blocked"] for r in rows),
            "seconds_p50": statistics.median(times) if times else None,
            "seconds_p95": times[min(len(times) - 1, int(len(times) * 0.95))] if times else None,
            "over_turn_timeout": sum(t >= conversation.TURN_TIMEOUT for t in times)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cases", type=Path, default=CASES)
    ap.add_argument("--deployment", help="Azure OpenAI 배포 이름 (비우면 .env 값)")
    ap.add_argument("--tale", help="joy·sad·surprise·anger 중 하나만")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="호출 없이 첫 사례의 메시지만 출력")
    args = ap.parse_args(argv)

    cases = json.loads(args.cases.read_text(encoding="utf-8"))["cases"]
    cases = [c for c in cases if not args.tale or c["tale"] == args.tale][: args.limit]
    if args.dry_run:
        c = cases[0]
        conv = conv_for(c)
        print(json.dumps(prompts.build_messages(tales()[c["tale"]], c["turn"], "라온이", c["text"],
                                                conversation.model_context(conv)), ensure_ascii=False, indent=1))
        return 0
    if args.deployment:
        config.settings = dataclasses.replace(config.settings, openai_deployment=args.deployment)
    s = config.settings
    if not s.openai_enabled:
        print("Azure OpenAI 설정이 없어요 (AZURE_OPENAI_ENDPOINT·KEY·DEPLOYMENT). --dry-run으로 모양만 볼 수 있어요.",
              file=sys.stderr)
        return 2
    print(f"배포 {s.openai_deployment}, 사례 {len(cases)}개, PII {s.language_enabled}, "
          f"Content Safety {s.content_safety_enabled}, 프롬프트 {prompts.PROMPT_VERSION}", file=sys.stderr)
    rows = []
    for i, case in enumerate(cases, 1):
        rows.append(run_case(case))
        print(f"{i}/{len(cases)} {case['id']} {rows[-1]['outcome']} {rows[-1]['seconds']}s", file=sys.stderr)
    report = {"run_at": datetime.now(timezone.utc).isoformat(), "deployment": s.openai_deployment,
              "prompt_version": prompts.PROMPT_VERSION, "cases_version": json.loads(args.cases.read_text())["version"],
              "services": {"pii": s.language_enabled, "content_safety": s.content_safety_enabled},
              "summary": summarize(rows), "rows": rows}
    out = args.out or ROOT / "docs" / "ai" / "eval" / "results" / (
        f"{s.openai_deployment}-{datetime.now().strftime('%Y%m%d-%H%M')}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=1))
    print(f"저장: {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
