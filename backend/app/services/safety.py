"""대화 안전 처리.

- mask_pii: Azure AI Language PII 감지. 키가 없거나 실패하면 로컬 규칙만 적용한다.
- check: Azure AI Content Safety 텍스트 분석. 키가 없으면 통과, 키가 있는데 실패하면 막는다.
  기준(max_severity)은 prompts.py의 INPUT_MAX_SEVERITY·OUTPUT_MAX_SEVERITY.
로그에는 오류 종류만 남기고 문장은 남기지 않는다.
"""
import logging
import re

from .. import config
from . import azure

log = logging.getLogger("maeum.safety")

LANGUAGE_API_VERSION = "2023-04-01"
SAFETY_API_VERSION = "2024-09-01"
SAFETY_CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"]

_PHONE = re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


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


def mask_pii(text: str, deadline: float | None = None) -> str:
    if config.settings.language_enabled:
        try:
            text = _redact_azure(text, deadline)
        except Exception as error:
            log.warning("Azure AI Language PII 실패, 로컬 규칙 사용: %s", type(error).__name__)
    return _mask_local(text)


def check(text: str, max_severity: int, deadline: float | None = None) -> tuple[bool, list[str]]:
    """(통과 여부, 기준을 넘은 범주 이름). 호출 실패로 막을 때 범주는 빈 목록."""
    s = config.settings
    if not s.content_safety_enabled:
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
