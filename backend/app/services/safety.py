"""대화 안전 처리.

- mask_pii: Azure AI Language PII 감지. 키가 없거나 실패하면 로컬 규칙(전화번호·이메일)만 적용한다.
  mask_pii_checked는 (가린 문장, Azure로 가렸는지)를 돌려준다. 모델을 부를지는 conversation.py가 정책으로 정한다.
- check: Azure AI Content Safety 텍스트 분석. 키가 있는데 실패하면 막는다.
  키가 없으면 통과. 단 AI_SAFETY_REQUIRED=true면 막는다.
  기준(max_severity)은 prompts.py의 INPUT_MAX_SEVERITY·OUTPUT_MAX_SEVERITY.

정책 표는 backend/README.md '안전 서비스가 없거나 실패할 때'.
로그에는 오류 종류만 남기고 문장은 남기지 않는다.
"""
import logging
import re
import unicodedata

from .. import config
from . import azure

log = logging.getLogger("maeum.safety")

LANGUAGE_API_VERSION = "2023-04-01"
SAFETY_API_VERSION = "2024-09-01"
SAFETY_CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"]

_PHONE = re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


# Local rules cover explicit profanity and standalone unclear speech only. Intent, reported harm,
# play and negation need context: the existing Azure checks and conversation model decide those.
# Normalize the patterns just like the input: NFKC changes compatibility jamo (ㅆㅂ/ㅋㅋ/ㅎㅎ).
_PROFANITY = re.compile(unicodedata.normalize("NFKC", r"씨발|ㅆㅂ|병신|개새끼|시발(?!점|역|열차)"))
_UNCLEAR = re.compile(unicodedata.normalize("NFKC", r"(?:아+)?(?:몰라)+|(?:하){3,}|ㅋ{2,}|ㅎ{2,}"))


def input_redirect_reason(text: str) -> str | None:
    """명확한 욕설·뜻 없는 단독 발화만 돌린다. 위협의 의미 판단은 안전 서비스와 모델로 보낸다."""
    compact = re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))
    if _PROFANITY.search(compact):
        return "LocalProfanity"
    sentences = [s for s in re.split(r"[.!?。！？\n]+", compact) if s]
    if sentences and all(_UNCLEAR.fullmatch(s) for s in sentences):
        return "Unclear"
    return None


def _mask_local(text: str) -> str:
    text = _PHONE.sub("[전화번호]", text)
    return _EMAIL.sub("[이메일]", text)


def _redact_azure(text: str, deadline: float | None) -> str:
    s = config.settings
    data = azure.post_json(
        f"{s.language_endpoint}/language/:analyze-text?api-version={LANGUAGE_API_VERSION}",
        {"Ocp-Apim-Subscription-Key": s.language_key},
        {"kind": "PiiEntityRecognition", "parameters": {"modelVersion": "latest"},
         "analysisInput": {"documents": [{"id": "1", "language": "ko", "text": text}]}},
        deadline,
    )
    redacted = data["results"]["documents"][0]["redactedText"]
    if not isinstance(redacted, str):
        raise ValueError("redactedText 없음")
    return redacted


def mask_pii_checked(text: str, deadline: float | None = None) -> tuple[str, bool]:
    """(가린 문장, Azure PII로 가렸는지). 로컬 규칙은 항상 한 번 더 적용한다."""
    by_azure = False
    if config.settings.language_enabled:
        try:
            text = _redact_azure(text, deadline)
            by_azure = True
        except Exception as error:
            log.warning("Azure AI Language PII 실패, 로컬 규칙 사용: %s", type(error).__name__)
    return _mask_local(text), by_azure


def mask_pii(text: str, deadline: float | None = None) -> str:
    return mask_pii_checked(text, deadline)[0]


def check(text: str, max_severity: int, deadline: float | None = None) -> tuple[bool, list[str]]:
    """(통과 여부, 기준을 넘은 범주 이름). 호출 실패로 막을 때 범주는 빈 목록."""
    s = config.settings
    if not s.content_safety_enabled:
        if s.ai_safety_required:
            log.warning("Azure AI Content Safety 설정 없음, AI_SAFETY_REQUIRED라 막음")
            return False, []
        return True, []
    try:
        data = azure.post_json(
            f"{s.safety_endpoint}/contentsafety/text:analyze?api-version={SAFETY_API_VERSION}",
            {"Ocp-Apim-Subscription-Key": s.safety_key},
            {"text": text, "categories": SAFETY_CATEGORIES, "outputType": "FourSeverityLevels"},
            deadline,
        )
        over = [c["category"] for c in data["categoriesAnalysis"] if c.get("severity", 0) > max_severity]
    except Exception as error:
        log.warning("Azure AI Content Safety 실패, 막음: %s", type(error).__name__)
        return False, []
    return not over, over
