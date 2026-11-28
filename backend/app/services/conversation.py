"""학습 3 대화 엔진. 프롬프트·응답 해석·말투 기준은 prompts.py (AI 담당), 여기는 순서·시간·안전·기록이다.

한 턴 (resolved_by: 친구 답을 무엇으로 정했는지, 대화 기록과 리포트에 남긴다)
- 보기 버튼(choice_index, input_mode picture)                      → 대본 답 (button)
- 기기에서 알아들은 말이 보기와 같음(choice_index, input_mode voice) → 대본 답 (exact)
- 말·글(text): mask_pii → safety.check(입력 기준)
    → 보기와 글자가 같으면 대본 답 (exact)
    → PII 정책 확인(_may_send): AI_SAFETY_REQUIRED인데 Azure PII로 가리지 못했으면 그림 선택
    → 하루 호출 예약(store.reserve_generation) → Azure OpenAI(JSON) → prompts.parse (형식이 틀리면 4초 안에서 한 번 다시)
      모델 문맥: 고른 행동과 결과(conv["actions"]), 이전 턴의 마스킹된 말과 답(conv["turns"])
      → prompts.resolve: match면 그 보기의 대본 답·표정, 아니면 모델 말 → safety.check(출력 기준) (llm)
- 중간에 막히거나 실패하면 그림 선택으로 돌아간다 (fallback). 한 턴의 외부 호출 전체는 TURN_TIMEOUT초.
- 저장·로그에는 마스킹된 문장만 남긴다. 그림으로 돌아간 턴은 문장 없이 resolved_by만 남긴다.
- Content Safety에 막히면 conv["safety"]에 차단 여부와 범주만 남긴다.
"""
import logging
import unicodedata

from .. import config
from ..content import friend_name, tales
from . import azure, prompts, safety

log = logging.getLogger("maeum.conversation")

MAX_TURNS = 2  # 기본 대화 1회 + 추가 대화 1회 (프론트 흐름과 동일)
TURN_TIMEOUT = 4.0  # 한 턴의 외부 호출 전체 제한 (프론트 제한 5초보다 짧게)
FORMAT_TRIES = 2  # 형식이 틀리면 한 번 다시 (마감 안에서만)
OPENAI_API_VERSION = "2024-10-21"
RESOLVED_BY = ("button", "exact", "llm", "fallback")


def opening(topic_id: str) -> tuple[str, list[str]]:
    talk = tales()[topic_id]["talk"]
    return talk["ask"], talk["choices"]


def _script(talk: dict, turn: int) -> tuple[list[str], list[str], list]:
    if turn == 0:
        return talk["choices"], talk["replies"], talk.get("replyExpressions") or []
    return talk["extra"], talk["ends"], talk.get("endExpressions") or []


def _plain(text: str) -> str:
    """글자와 숫자만 (프론트 StoryVoice의 normalize와 같은 규칙)."""
    return "".join(ch for ch in unicodedata.normalize("NFKC", text) if ch.isalnum()).lower()


def _match_text(text: str, choices: list[str]) -> int | None:
    """띄어쓰기·문장부호를 빼고 보기와 글자가 같으면 그 번호. 뜻으로 맞추는 것은 모델이 한다."""
    said = _plain(text)
    for i, choice in enumerate(choices):
        if said and said == _plain(choice):
            return i
    return None


def generated_on(conversations: list[dict], day: str) -> int:
    """그 아이의 대화들에서 day(한국 날짜)에 한 모델 호출 수."""
    return sum(c.get("generated", {}).get(day, 0) for c in conversations)


def _may_call(conv: dict, day: str, used_today: int, reserve=None) -> bool:
    """비용 제한(prompts.DAILY_GENERATION_LIMIT). 부를 수 있으면 이번 호출을 conv["generated"][day]에 센다.
    reserve: 아이·날짜별 카운터를 한 번에 확인하고 늘리는 함수 (store.reserve_generation). 동시에 와도 넘지 않는다.
    없으면 used_today(그 아이 대화들의 generated 합)로 판단한다 (이전 방식, 동시 요청에 약함)."""
    allowed = reserve() if reserve is not None else used_today < prompts.DAILY_GENERATION_LIMIT
    if not allowed:
        conv["limited"] = conv.get("limited", 0) + 1
        log.info("하루 생성 호출 제한에 걸림")
        return False
    counts = conv.setdefault("generated", {})
    counts[day] = counts.get(day, 0) + 1
    return True


def model_context(conv: dict) -> dict:
    """모델에 넘길 문맥: 고른 행동 번호들과 이전 턴(마스킹된 말·답, 그림으로 돌아간 턴 제외)."""
    history = [{"said": t["said"], "reply": t["reply"]} for t in conv.get("turns", [])
               if t.get("said") and t.get("reply")]
    return {"actions": list(conv.get("actions") or []), "history": history}


def _may_send(pii_by_azure: bool) -> bool:
    """PII 정책: AI_SAFETY_REQUIRED이면 Azure PII로 가린 말만 모델에 보낸다.
    아니면(로컬·시연) Azure가 없거나 실패해도 로컬 규칙으로 가린 말을 보낸다."""
    if pii_by_azure or not config.settings.ai_safety_required:
        return True
    log.warning("Azure AI Language PII로 가리지 못함, AI_SAFETY_REQUIRED라 모델을 부르지 않음")
    return False


def _ask_model(conv: dict, turn: int, said: str, deadline: float, day: str, generated_today: int,
               reserve=None) -> dict | None:
    """Azure OpenAI에 묻고 prompts.parse를 통과한 응답을 돌려준다. 키가 없거나 제한·실패·형식 오류면 None.
    형식이 틀리면 마감 안에서 한 번 더 묻는다 (azure.post_json이 마감을 넘기면 실패)."""
    s = config.settings
    if not s.openai_enabled:
        return None
    messages = prompts.build_messages(tales()[conv["topic_id"]], turn, friend_name(conv.get("friend")), said,
                                      model_context(conv))
    for attempt in range(FORMAT_TRIES):
        if not _may_call(conv, day, generated_today + attempt, reserve):
            return None
        try:
            data = azure.post_json(
                f"{s.openai_endpoint}/openai/deployments/{s.openai_deployment}/chat/completions"
                f"?api-version={OPENAI_API_VERSION}",
                {"api-key": s.openai_key},
                {"messages": messages, **prompts.GENERATION},
                deadline,
            )
            output = prompts.parse(data["choices"][0]["message"]["content"])
        except Exception as error:
            log.warning("Azure OpenAI 실패: %s", type(error).__name__)
            return None
        if output is not None:
            return output
        log.info("모델 응답 형식이 맞지 않음 (%d번째)", attempt + 1)
    return None


def _safe(conv: dict, text: str, max_severity: int, deadline: float) -> bool:
    allowed, categories = safety.check(text, max_severity, deadline)
    if not allowed:
        conv.setdefault("safety", []).append({"blocked": True, "categories": categories})
    return allowed


def take_turn(conv: dict, choice_index: int | None, text: str | None, input_mode: str = "picture",
              day: str = "", generated_today: int = 0, reserve=None) -> dict:
    """day: 오늘(한국 날짜), generated_today: 그 아이가 오늘 이미 모델을 부른 수 (generated_on, reserve가 없을 때만).
    reserve: 모델을 한 번 부를 때마다 하루 제한을 확인하고 세는 함수 (store.reserve_generation을 묶은 것).
    돌려주는 값: {"reply", "expression", "said", "resolved_by"} 또는 {"fallback": True, "choices", "resolved_by": "fallback"}."""
    turn = conv["turn"]
    talk = tales()[conv["topic_id"]]["talk"]
    choices, lines, expressions = _script(talk, turn)

    def script(index: int, resolved_by: str, said: str | None = None) -> dict:
        return {"reply": lines[index], "expression": expressions[index] if index < len(expressions) else None,
                "said": said if said is not None else choices[index], "resolved_by": resolved_by}

    def fallback() -> dict:
        return {"fallback": True, "choices": choices, "resolved_by": "fallback"}

    if choice_index is not None:
        if choice_index >= len(choices):
            return fallback()
        return script(choice_index, "exact" if input_mode == "voice" else "button")
    if not text:
        return fallback()

    deadline = azure.deadline_in(TURN_TIMEOUT)
    masked, pii_by_azure = safety.mask_pii_checked(text, deadline)  # 이후로는 마스킹된 문장만 쓴다
    if not _safe(conv, masked, prompts.INPUT_MAX_SEVERITY, deadline):
        return fallback()
    index = _match_text(masked, choices)
    if index is not None:
        return script(index, "exact")
    if not _may_send(pii_by_azure):
        return fallback()

    output = _ask_model(conv, turn, masked, deadline, day, generated_today, reserve)
    resolved = prompts.resolve(tales()[conv["topic_id"]], turn, output)
    if resolved is None:
        if output is not None:
            log.info("모델 응답으로 답을 정하지 못함 (이야기 밖이거나 검사 불통과)")
        return fallback()
    if resolved["match"] is None and not _safe(conv, resolved["reply"], prompts.OUTPUT_MAX_SEVERITY, deadline):
        return fallback()
    return {"reply": resolved["reply"], "expression": resolved["expression"], "said": masked, "resolved_by": "llm",
            "prompt_version": prompts.PROMPT_VERSION, "generated": resolved["match"] is None}
