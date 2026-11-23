"""학습 3 대화 엔진.

- 보기 선택: 동화(tales.json)의 talk 대본으로 응답 (프론트 내장 대본과 동일)
- 말·글 입력: 아이 문장 → mask_pii → safety.check(입력 기준) → 보기와 맞으면 대본, 아니면 _generate → safety.check(출력 기준)
- 중간에 막히거나 실패하면(전체 TURN_TIMEOUT초) 그림 선택으로 돌아감
- 아이 한 명의 하루 생성 호출이 prompts.DAILY_GENERATION_LIMIT에 닿으면 _generate를 부르지 않고 그림 선택으로 돌아감
- 저장·로그에는 마스킹된 문장만 남긴다. 프롬프트·응답 검사·안전 기준은 prompts.py
- Content Safety에 막히면 conv["safety"]에 차단 여부와 범주만 남긴다 (문장은 남기지 않음)
"""
import logging

from .. import config
from ..content import tales
from . import azure, prompts, safety

log = logging.getLogger("maeum.conversation")

MAX_TURNS = 2  # 기본 대화 1회 + 추가 대화 1회 (프론트 흐름과 동일)
TURN_TIMEOUT = 4.0  # 한 턴의 외부 호출 전체 제한 (프론트 제한 5초보다 짧게)
OPENAI_API_VERSION = "2024-10-21"


def opening(topic_id: str) -> tuple[str, list[str]]:
    talk = tales()[topic_id]["talk"]
    return talk["ask"], talk["choices"]


def _choices_for(topic_id: str, turn: int) -> list[str]:
    talk = tales()[topic_id]["talk"]
    return talk["choices"] if turn == 0 else talk["extra"]


def _match_text(text: str, choices: list[str]) -> int | None:
    """말·글 입력을 보기 중 하나로 맞춘다. 맞지 않으면 None."""
    norm = text.replace(" ", "")
    for i, choice in enumerate(choices):
        key = choice.replace(" ", "").rstrip("!.?")
        if key and (key in norm or norm in key):
            return i
    return None


def _generate(topic_id: str, said: str, ask: str, deadline: float | None = None) -> tuple[str, str] | None:
    """Azure OpenAI로 친구 답과 표정을 만든다. 키가 없거나 실패하거나 검사를 통과하지 못하면 None."""
    s = config.settings
    if not s.openai_enabled:
        return None
    try:
        data = azure.post_json(
            f"{s.openai_endpoint}/openai/deployments/{s.openai_deployment}/chat/completions"
            f"?api-version={OPENAI_API_VERSION}",
            {"api-key": s.openai_key},
            {"messages": prompts.build_messages(tales()[topic_id], ask, said), **prompts.GENERATION},
            deadline,
        )
        content = data["choices"][0]["message"]["content"]
    except Exception as error:
        log.warning("Azure OpenAI 실패: %s", type(error).__name__)
        return None
    text, expression = prompts.split_expression(content)
    reply = prompts.check_reply(text)
    if reply is None:
        log.info("생성 응답이 검사를 통과하지 못함")
        return None
    return reply, expression


def _safe(conv: dict, text: str, max_severity: int, deadline: float) -> bool:
    allowed, categories = safety.check(text, max_severity, deadline)
    if not allowed:
        conv.setdefault("safety", []).append({"blocked": True, "categories": categories})
    return allowed


def generated_on(conversations: list[dict], day: str) -> int:
    """그 아이의 대화들에서 day(한국 날짜)에 한 생성 호출 수."""
    return sum(c.get("generated", {}).get(day, 0) for c in conversations)


def _may_generate(conv: dict, day: str, generated_today: int) -> bool:
    """비용 제한(prompts.DAILY_GENERATION_LIMIT). 키가 없으면 호출 자체가 없으므로 세지 않는다.
    부를 수 있으면 이번 호출을 conv["generated"][day]에 세고, 넘었으면 conv["limited"]를 늘린다."""
    if not config.settings.openai_enabled:
        return True
    if generated_today >= prompts.DAILY_GENERATION_LIMIT:
        conv["limited"] = conv.get("limited", 0) + 1
        log.info("하루 생성 호출 제한에 걸림")
        return False
    counts = conv.setdefault("generated", {})
    counts[day] = counts.get(day, 0) + 1
    return True


def take_turn(conv: dict, choice_index: int | None, text: str | None,
              day: str = "", generated_today: int = 0) -> dict:
    """day: 오늘(한국 날짜), generated_today: 그 아이가 오늘 이미 한 생성 호출 수 (generated_on)."""
    topic_id, turn = conv["topic_id"], conv["turn"]
    talk = tales()[topic_id]["talk"]
    choices = _choices_for(topic_id, turn)

    if choice_index is None and text:
        deadline = azure.deadline_in(TURN_TIMEOUT)
        masked = safety.mask_pii(text, deadline)  # 이후로는 마스킹된 문장만 쓴다
        if not _safe(conv, masked, prompts.INPUT_MAX_SEVERITY, deadline):
            return {"fallback": True, "choices": choices}
        choice_index = _match_text(masked, choices)
        if choice_index is None:
            if not _may_generate(conv, day, generated_today):
                return {"fallback": True, "choices": choices, "limited": True}
            ask = talk["ask"] if turn == 0 else talk["again"]
            generated = _generate(topic_id, masked, ask, deadline)
            if generated is None or not _safe(conv, generated[0], prompts.OUTPUT_MAX_SEVERITY, deadline):
                return {"fallback": True, "choices": choices}
            return {"reply": generated[0], "expression": generated[1], "said": masked, "index": None}

    if choice_index is None or choice_index >= len(choices):
        return {"fallback": True, "choices": choices}

    reply = talk["replies"][choice_index] if turn == 0 else talk["ends"][choice_index]
    # 대본 대사마다 정한 표정 (tales.json replyExpressions·endExpressions, 없으면 None)
    expressions = talk.get("replyExpressions" if turn == 0 else "endExpressions") or []
    expression = expressions[choice_index] if choice_index < len(expressions) else None
    return {"reply": reply, "expression": expression, "said": choices[choice_index], "index": choice_index}
