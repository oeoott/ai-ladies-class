"""Azure AI Speech 토큰. 브라우저(Speech SDK)는 이 토큰과 지역만 받고, 키는 서버 환경 변수에만 있다.

- 발급: POST https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken, 헤더 Ocp-Apim-Subscription-Key
- 토큰은 10분 유효. 9분 동안 서버에서 다시 쓴다 (Microsoft 문서 권장). 아이마다 하루 발급 수는 routers/speech.py.
- 음성은 브라우저에서 Azure로 바로 간다 (이 서버를 거치지 않음). 음성·인식 원문·토큰은 저장·로그하지 않는다.
"""
import logging
import threading
import time

from .. import config
from . import azure

log = logging.getLogger("maeum.speech")

LANGUAGE = "ko-KR"
TOKEN_SECONDS = 600  # Azure 토큰 유효 시간
REUSE_SECONDS = 540  # 서버가 같은 토큰을 다시 주는 시간 (9분)
TIMEOUT = 4.0

_lock = threading.Lock()
_cache: dict = {"token": None, "until": 0.0, "region": None}


def clear_cache() -> None:
    with _lock:
        _cache.update(token=None, until=0.0, region=None)


def issue_token() -> tuple[str, int] | None:
    """(토큰, 남은 초). 설정이 없거나 실패하면 None. 토큰 값은 로그에 남기지 않는다."""
    s = config.settings
    if not s.speech_enabled:
        return None
    now = time.monotonic()
    with _lock:
        if _cache["token"] and _cache["region"] == s.speech_region and now < _cache["until"]:
            return _cache["token"], int(_cache["until"] - now)
    try:
        token = azure.post_text(f"https://{s.speech_region}.api.cognitive.microsoft.com/sts/v1.0/issueToken",
                                {"Ocp-Apim-Subscription-Key": s.speech_key}, azure.deadline_in(TIMEOUT)).strip()
    except Exception as error:
        log.warning("Azure Speech 토큰 발급 실패: %s", type(error).__name__)
        return None
    if not token:
        return None
    with _lock:
        _cache.update(token=token, until=time.monotonic() + REUSE_SECONDS, region=s.speech_region)
    return token, REUSE_SECONDS
