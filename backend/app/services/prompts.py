"""학습 3 대화: 프롬프트와 모델 응답 해석. AI 담당은 이 파일만 고치면 된다.

아이 말이 보기와 다를 때만 모델을 부른다 (호출 순서·시간 제한·안전 검사·재시도는 conversation.py).
1. build_messages(tale, turn, friend_name, transcript, context)로 메시지를 만든다
   (transcript는 마스킹된 아이 말, context는 고른 행동과 이전 턴. 턴마다 REPLY_RULES가 다르다)
2. 모델은 RESPONSE_SCHEMA 모양의 JSON 하나로 답한다: {"match": 0|1|null, "offTopic": bool, "reply": str|null, "expression": str}
3. parse(content)가 형식을 확인한다. 틀리면 None → conversation.py가 시간(4초) 안에서 한 번 다시 부른다
4. resolve(tale, turn, output)가 친구 답을 정한다
   - match가 있으면: 그 보기의 대본 답(replies·ends)과 대본 표정(replyExpressions·endExpressions)
   - match가 null이고 offTopic이 false면: reply (check_reply를 통과해야 함)와 expression
   - 그 밖(offTopic, 형식 오류, 검사 불통과)은 None → 그림 선택으로 돌아감 (fallback_to_picture)

말투 규칙은 프롬프트(SYSTEM_PROMPT)에 넣고, 코드는 문장 수·질문 수·길이·금지어만 검사한다 (check_reply).
"""
import json
import re

# 친구 얼굴로 그릴 수 있는 표정 (frontend PaintedFriend). 모델은 이 중 하나를 고른다.
EXPRESSIONS = ("joy", "surprise", "sad", "anger", "neutral")
DEFAULT_EXPRESSION = "neutral"

# 모델이 돌려줄 JSON 모양 (Azure OpenAI structured outputs, strict). 보기는 동화마다 두 개다.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "match": {"type": ["integer", "null"], "enum": [0, 1, None]},
        "offTopic": {"type": "boolean"},
        "reply": {"type": ["string", "null"]},
        "expression": {"type": "string", "enum": list(EXPRESSIONS)},
    },
    "required": ["match", "offTopic", "reply", "expression"],
    "additionalProperties": False,
}

# Azure OpenAI chat completions 요청에 함께 보내는 값
GENERATION = {
    "temperature": 0.3,
    "max_tokens": 150,
    "response_format": {"type": "json_schema",
                        "json_schema": {"name": "friend_turn", "strict": True, "schema": RESPONSE_SCHEMA}},
}

# 코드 검사 기준 (check_reply)
MAX_REPLY_CHARS = 60  # 공백 포함 글자 수
MAX_SENTENCES = 2
MAX_QUESTIONS = 1
# 친구 말에 나오면 안 되는 낱말 (비속어·놀리는 말). 필요하면 AI 담당이 더한다.
BANNED_WORDS = ("바보", "멍청", "병신", "씨발", "시발", "새끼", "개새", "꺼져", "닥쳐", "죽어", "죽을래")

# Azure AI Content Safety 심각도(0·2·4·6) 기준. 범주 하나라도 이 값보다 높으면 막는다.
# 아이 입력: 화남 주제의 '짜증나', '때리고 싶어' 같은 감정 표현(보통 2)은 통과시키고 4 이상만 막는다.
INPUT_MAX_SEVERITY = 2
# 모델이 만든 친구 말(reply): 조금이라도 걸리면 막는다. 대본 답(match)은 검사하지 않는다.
OUTPUT_MAX_SEVERITY = 0

# 비용 제한. 아이 한 명이 오늘(한국 날짜) 이만큼 모델을 불렀으면 더 부르지 않고 그림 선택으로 돌아간다.
# 실패·형식 오류로 다시 부른 호출도 센다. 보기 선택과 보기와 같은 말은 대본으로 답하므로 세지 않는다.
DAILY_GENERATION_LIMIT = 30

# 프롬프트 버전. 프롬프트·규칙을 바꾸면 올린다. 대화 기록(턴의 prompt_version)과 평가 결과에 남는다.
PROMPT_VERSION = "friend-v0.2-draft"

# 최종 프롬프트가 오면 SYSTEM_PROMPT와 REPLY_RULES만 바꾸면 된다. {이름} 자리는 build_messages가 채운다.
SYSTEM_PROMPT = """너는 동화 「{title}」 속 숲 친구 {friend_name}다. 6~9세 아이와 이 동화 장면 안에서만 이야기한다.
이야기: {story}
장면: {situation} {explanation}
아이가 고른 행동: {action}
{history}방금 아이에게 한 질문: {ask}
화면의 보기:
0: {choice0}
1: {choice1}

아이가 한 말을 읽고 JSON 하나로만 답한다.
- match: 아이 말이 보기 0이나 1과 같은 뜻이면 그 번호. 아니면 null.
- offTopic: 아이 말이 이 동화 장면과 관계없거나 무슨 뜻인지 알 수 없으면 true. 이때 reply는 null.
- reply: match가 null이고 offTopic이 false일 때만 쓴다. 아니면 null.
- expression: reply에 맞는 친구 얼굴 표정. {expressions} 중 하나.

{reply_rules}

모든 reply에 지킬 것:
- 아이 말에 공감하고, 말 그대로 알아들을 수 있게 쓴다. 비유, 반어, 농담, 관용구를 쓰지 않는다.
- 마음을 말할 때는 기쁜, 슬픈, 놀란, 화난 같은 감정 낱말을 그대로 쓴다.
- "틀렸어", "아니야" 같은 말로 아이 말을 고치지 않는다. 칭찬할 때는 아이가 한 말이나 행동을 짚어서 한다.
- 아이가 아는 쉬운 낱말만 쓴다.
- 이 동화 장면 밖의 주제를 꺼내지 않는다.
- 이름, 나이, 사는 곳, 학교, 전화번호 같은 개인정보를 묻거나 따라 말하지 않는다.
- 무섭거나 다치는 이야기, 놀리는 말을 하지 않는다."""

# 턴마다 다른 reply 규칙 (번호 = 턴). 0: 친구의 답. 그 뒤 화면이 고정 질문(again)을 이어 간다.
# 1(마지막 턴): 대화가 끝나고 '이야기를 마쳤어요' 장면에 나오는 마무리 문장. 대본 ends처럼 일어난 일을 서술한다.
REPLY_RULES = (
    """reply 말투 규칙 (친구의 답):
- 1~2문장으로 말한다. 질문은 많아야 1개. {max_chars}자 이내.
- 동화 속 친구처럼 반말로 말한다. '~요', '~니다'로 끝내지 않는다.
- 다음에는 화면이 정해진 질문을 하므로, 질문을 한다면 그 질문과 겹치지 않게 짧게 한다.""",
    """reply 말투 규칙 (이야기의 마무리 문장):
- 이 답으로 대화가 끝난다. 아이가 말한 일을 친구들이 함께 했다고 이야기책처럼 서술한다.
- 1~2문장, {max_chars}자 이내. '~했어요'처럼 짧은 존댓말로 쓴다. 질문하지 않는다.
- 예: "초대장 끝에 작은 꽃을 그렸어요. 새 편지가 완성됐어요.\"""",
)
# 턴마다 reply에 허용하는 질문 수 (check_reply). 마지막 턴은 대화가 끝나므로 질문하지 않는다.
MAX_QUESTIONS_BY_TURN = (MAX_QUESTIONS, 0)

NO_ACTION = "(아직 고르지 않음)"


def _lines(tale: dict, turn: int) -> tuple[str, list[str], list[str], list]:
    """turn 0: 첫 질문(ask)과 choices·replies, turn 1: 추가 질문(again)과 extra·ends."""
    talk = tale["talk"]
    if turn == 0:
        return talk["ask"], talk["choices"], talk["replies"], talk.get("replyExpressions") or []
    return talk["again"], talk["extra"], talk["ends"], talk.get("endExpressions") or []


def _action_text(tale: dict, actions: list[int]) -> str:
    """고른 행동과 결과. actions: 이 산책에서 고른 행동 번호(순서대로, 마지막이 지금 결과)."""
    known = [i for i in actions if isinstance(i, int) and 0 <= i < len(tale["actions"])]
    if not known:
        return NO_ACTION
    a = tale["actions"][known[-1]]
    text = f"{a['label']} → {a['event']} (친구가 한 말: {a['line']})"
    others = [tale["actions"][i]["label"] for i in dict.fromkeys(known[:-1]) if i != known[-1]]
    return text + (f" 먼저 '{others[0]}'도 해 보았다." if others else "")


def _history_text(history: list[dict]) -> str:
    """이전 턴 (마스킹된 아이 말과 답). 그림으로 돌아간 턴은 문장이 없어 넣지 않는다."""
    rows = [f"- 아이: {h['said']} / 답: {h['reply']}" for h in history if h.get("said") and h.get("reply")]
    return ("지금까지 나눈 대화:\n" + "\n".join(rows) + "\n") if rows else ""


def build_messages(tale: dict, turn: int, friend_name: str, transcript: str,
                   context: dict | None = None) -> list[dict]:
    """friend_name: 받침에 따라 '라온이', '보리', '두리' (content.friend_name). transcript: 마스킹된 아이 말.
    context(선택): {"actions": [고른 행동 번호...], "history": [{"said", "reply"}...]} (conversation.py가 대화 문서에서 만든다)."""
    context = context or {}
    ask, choices, _, _ = _lines(tale, turn)
    named = lambda text: text.replace("{친구}", friend_name)  # noqa: E731
    rules = REPLY_RULES[min(turn, len(REPLY_RULES) - 1)].format(max_chars=MAX_REPLY_CHARS)
    system = SYSTEM_PROMPT.format(
        title=tale["title"], friend_name=friend_name, story=" ".join(named(p) for p in tale["pages"]),
        situation=tale["situation"], explanation=tale["explanation"],
        action=_action_text(tale, context.get("actions") or []), history=_history_text(context.get("history") or []),
        ask=named(ask), choice0=choices[0], choice1=choices[1], expressions=", ".join(EXPRESSIONS),
        reply_rules=rules)
    return [{"role": "system", "content": system}, {"role": "user", "content": transcript}]


def parse(content: object) -> dict | None:
    """모델 응답(JSON 문자열)을 확인한다. 모양이 틀리면 None (한 번 다시 부름).
    목록에 없는 표정은 형식 오류로 보지 않고 neutral로 바꾼다."""
    try:
        data = json.loads(content) if isinstance(content, str) else None
    except ValueError:
        return None
    if not isinstance(data, dict) or set(data) != set(RESPONSE_SCHEMA["required"]):
        return None
    match, off_topic, reply, expression = data["match"], data["offTopic"], data["reply"], data["expression"]
    # 정수 0·1만 받는다. 0.0·1.0(float)과 True·False(bool)는 `in (0, 1)`을 통과하므로 type으로 거른다.
    if match is not None and (type(match) is not int or match not in (0, 1)):
        return None
    if not isinstance(off_topic, bool) or not (reply is None or isinstance(reply, str)) or not isinstance(expression, str):
        return None
    return {"match": match, "offTopic": off_topic, "reply": reply,
            "expression": expression if expression in EXPRESSIONS else DEFAULT_EXPRESSION}


def resolve(tale: dict, turn: int, output: dict | None) -> dict | None:
    """parse()를 통과한 모델 응답으로 친구 답을 정한다. None이면 그림 선택으로 돌아간다.
    돌려주는 값: {"reply", "expression", "match"} (match가 None이면 모델이 만든 말)."""
    if output is None:
        return None
    _, choices, lines, expressions = _lines(tale, turn)
    match = output["match"]
    if match is not None:
        if match >= len(choices):
            return None
        return {"reply": lines[match], "expression": expressions[match] if match < len(expressions) else None,
                "match": match}
    if output["offTopic"]:
        return None
    reply = check_reply(output["reply"], MAX_QUESTIONS_BY_TURN[min(turn, len(MAX_QUESTIONS_BY_TURN) - 1)])
    if reply is None:
        return None
    return {"reply": reply, "expression": output["expression"], "match": None}


_QUOTES = "\"'“”‘’「」"
_SENTENCE = re.compile(r"[^.!?…。]+[.!?…。]*")


def check_reply(text: object, max_questions: int = MAX_QUESTIONS) -> str | None:
    """코드 검사: 문장 수(MAX_SENTENCES), 질문 수(MAX_QUESTIONS), 길이(MAX_REPLY_CHARS), 금지어만.
    말투(반말·비유·관용구 등)는 프롬프트 규칙으로 맡긴다. 통과하면 다듬은 문장, 아니면 None."""
    if not isinstance(text, str):
        return None
    reply = " ".join(text.split()).strip(_QUOTES).strip()  # 줄바꿈·겹친 공백은 한 칸으로
    if not reply or len(reply) > MAX_REPLY_CHARS:
        return None
    if len([s for s in _SENTENCE.findall(reply) if s.strip(" .!?…。")]) > MAX_SENTENCES:
        return None
    if reply.count("?") + reply.count("？") > max_questions:
        return None
    if any(word in reply for word in BANNED_WORDS):
        return None
    return reply
