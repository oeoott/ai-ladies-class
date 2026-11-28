"""Azure 외부 호출 공통 지점.

한 턴의 호출(PII → 입력 검사 → 생성 → 출력 검사)은 같은 마감 시각(deadline)을 나눠 쓴다.
마감을 넘기거나 오류가 나면 예외를 던지고, 부르는 쪽이 실패로 처리한다.
요청 본문(아이 문장)은 로그에 남기지 않는다.
"""
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

DEFAULT_TIMEOUT = 4.0  # 프론트 제한(5초)보다 짧게

_client = httpx.Client()
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="azure")


def deadline_in(seconds: float = DEFAULT_TIMEOUT) -> float:
    return time.monotonic() + seconds


def post_json(url: str, headers: dict, body: dict, deadline: float | None = None) -> dict:
    remaining = (deadline or deadline_in()) - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("마감 시간이 지났어요.")
    # httpx 제한은 연결·읽기 단계별이라, 전체 시간은 future 대기로 한 번 더 묶는다.
    future = _pool.submit(_client.post, url, headers=headers, json=body, timeout=remaining)
    response = future.result(timeout=remaining)
    response.raise_for_status()
    return response.json()


def post_text(url: str, headers: dict, deadline: float | None = None) -> str:
    """본문 없는 POST, 응답을 글자로 (Speech issueToken). 마감·오류 처리는 post_json과 같다."""
    remaining = (deadline or deadline_in()) - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("마감 시간이 지났어요.")
    future = _pool.submit(_client.post, url, headers=headers, content=b"", timeout=remaining)
    response = future.result(timeout=remaining)
    response.raise_for_status()
    return response.text
