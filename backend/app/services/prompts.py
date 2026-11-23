"""학습 3 대화 프롬프트와 응답 검사. AI 담당은 이 파일만 고치면 된다.

- SYSTEM_PROMPT: 친구의 역할과 말투 규칙
- build_messages(): 동화 장면과 아이 문장(마스킹됨)으로 Azure OpenAI 메시지를 만든다
- split_expression(): 모델 응답 '[표정] 문장'에서 표정을 떼어 낸다 (목록에 없으면 neutral)
- check_reply(): 생성된 응답을 검사해 통과하면 다듬은 문장, 아니면 None (그림 선택으로 돌아감)
- INPUT_MAX_SEVERITY, OUTPUT_MAX_SEVERITY: Content Safety 기준
"""
import re

# Azure OpenAI chat completions 요청에 함께 보내는 값
GENERATION = {"max_tokens": 80, "temperature": 0.3}

MAX_REPLY_CHARS = 40  # 공백 포함 글자 수

# 친구 얼굴로 그릴 수 있는 표정 (frontend PaintedFriend). 모델은 이 중 하나를 고른다.
EXPRESSIONS = ("joy", "surprise", "sad", "anger", "neutral")
DEFAULT_EXPRESSION = "neutral"

# Azure AI Content Safety 심각도(0·2·4·6) 기준. 범주 하나라도 이 값보다 높으면 막는다.
# 아이 입력: 화남 주제의 '짜증나', '때리고 싶어' 같은 감정 표현(보통 2)은 통과시키고 4 이상만 막는다.
INPUT_MAX_SEVERITY = 2
# 생성 응답: 친구 말은 조금이라도 걸리면 막는다.
OUTPUT_MAX_SEVERITY = 0

SYSTEM_PROMPT = """너는 6~9세 아이와 함께 동화 속 장면에 들어와 있는 숲 친구다.
동화 제목: {title}
장면: {situation}
장면 설명: {explanation}
방금 아이에게 한 질문: {ask}

규칙:
- 아이 말에 공감하며 한 문장으로만 답한다.
- 동화 속 친구처럼 {max_chars}자 이내의 짧은 반말로 답한다. '~요', '~니다'로 끝내지 않는다.
  예: "나도 초대해 줘서 기뻐." "다음 비행기는 우리 함께 접자."
- 이 동화 장면 안의 이야기만 한다. 장면과 관계없는 말에는 장면 이야기로 부드럽게 돌아온다.
- 아이가 아는 쉬운 낱말만 쓴다. 영어, 숫자, 이모지, 따옴표, 비속어를 쓰지 않는다.
- 무섭거나 다치는 이야기, 놀리는 말, 어른의 화제는 꺼내지 않는다.
- 이름, 나이, 사는 곳, 학교, 전화번호 같은 개인정보를 묻거나 따라 말하지 않는다.
- 아이에게 새로운 질문을 하지 않는다.
- 답할 때 친구 얼굴 표정을 하나 골라 문장 앞에 붙인다. 형식: [표정] 문장
  표정은 {expressions} 중 하나만 쓴다. 예: [joy] 나도 초대해 줘서 기뻐."""


def build_messages(tale: dict, ask: str, said: str) -> list[dict]:
    """said는 mask_pii를 거친 문장이다."""
    system = SYSTEM_PROMPT.format(title=tale["title"], situation=tale["situation"],
                                  explanation=tale["explanation"], ask=ask, max_chars=MAX_REPLY_CHARS,
                                  expressions=", ".join(EXPRESSIONS))
    return [{"role": "system", "content": system}, {"role": "user", "content": said}]


_QUOTES = "\"'“”‘’「」"
_FORBIDDEN = re.compile(r"[A-Za-z0-9@#/\\<>\[\]{}*_=+|~^]")  # 영어·숫자·링크·마스킹 기호
_SENTENCE_END = re.compile(r"[.!?。…]")
_POLITE_END = re.compile(r"(요|니다)[.!?]?$")
_HANGUL_END = re.compile(r"[가-힣][.!?]?$")
# 친구 말에 나오면 안 되는 낱말 (비속어·놀리는 말). 필요하면 AI 담당이 더한다.
BANNED_WORDS = ("바보", "멍청", "병신", "씨발", "시발", "새끼", "개새", "꺼져", "닥쳐", "죽어", "죽을래")


_EXPRESSION_TAG = re.compile(r"^\s*\[\s*([A-Za-z]*)\s*\]\s*")


def split_expression(content: object) -> tuple[object, str]:
    """'[joy] 문장' → ('문장', 'joy'). 태그가 없거나 목록에 없는 표정이면 neutral. 문장 검사는 check_reply가 한다."""
    if not isinstance(content, str):
        return content, DEFAULT_EXPRESSION
    found = _EXPRESSION_TAG.match(content)
    if not found:
        return content, DEFAULT_EXPRESSION
    expression = found.group(1).lower()
    return content[found.end():], expression if expression in EXPRESSIONS else DEFAULT_EXPRESSION


def check_reply(text: object) -> str | None:
    if not isinstance(text, str):
        return None
    reply = text.strip().strip(_QUOTES).strip()
    if not reply or "\n" in reply or len(reply) > MAX_REPLY_CHARS:
        return None
    if _FORBIDDEN.search(reply):
        return None
    if _SENTENCE_END.search(reply.rstrip(".!?")):  # 한 문장만
        return None
    if any(word in reply for word in BANNED_WORDS):
        return None
    if _POLITE_END.search(reply) or not _HANGUL_END.search(reply):  # 동화 대본과 같은 반말
        return None
    return reply
