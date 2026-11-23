"""학습 콘텐츠 로더. 감정·동화 데이터는 이 폴더의 JSON 한 곳에만 있고, 프론트엔드(frontend/src/content.js)도 같은 파일을 읽는다.

감정을 추가할 때는 emotions.json과 tales.json에 같은 id로 한 항목씩 넣는다(README의 '감정 추가 체크리스트').
emotions.json의 키 순서가 날짜별 순환 순서다.
"""
import json
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent


@lru_cache
def emotions() -> dict:
    return json.loads((_DIR / "emotions.json").read_text(encoding="utf-8"))


@lru_cache
def tales() -> dict:
    return json.loads((_DIR / "tales.json").read_text(encoding="utf-8"))


def topic_ids() -> list[str]:
    """감정 id 목록 (emotions.json 순서)."""
    return list(emotions())
