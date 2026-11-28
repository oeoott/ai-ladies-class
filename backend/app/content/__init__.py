"""학습 콘텐츠 로더. 감정·동화 데이터는 이 폴더의 JSON 한 곳에만 있고, 프론트엔드(frontend/src/content.js)도 같은 파일을 읽는다.

감정을 추가할 때는 emotions.json과 tales.json에 같은 id로 한 항목씩 넣는다(README의 '감정 추가 체크리스트').
emotions.json의 키 순서가 날짜별 순환 순서다.
"""
import json
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent


# 공통 7감정 코드와 화면 이름. 콘텐츠(emotions.json)에 있는 감정만 아이 순환에 나온다.
EMOTION_CODES = {"anger": "화남", "disgust": "혐오", "fear": "두려움", "joy": "기쁨", "neutral": "무표정",
                 "sad": "슬픔", "surprise": "놀람"}


def _drafts_on() -> bool:
    """검수 전 초안(drafts/)을 합칠지. 미리보기·검수용으로만 켠다 (CONTENT_DRAFTS=true)."""
    from .. import config

    return bool(getattr(config.settings, "content_drafts", False))


@lru_cache
def _load(name: str, drafts: bool) -> dict:
    data = json.loads((_DIR / name).read_text(encoding="utf-8"))
    if drafts:
        extra = json.loads((_DIR / "drafts" / name).read_text(encoding="utf-8"))["entries"]
        data = {**data, **{k: v for k, v in extra.items() if k not in data}}  # 검수된 항목이 우선, 초안은 뒤에
    return data


def emotions() -> dict:
    return _load("emotions.json", _drafts_on())


def tales() -> dict:
    return _load("tales.json", _drafts_on())


def draft_ids() -> list[str]:
    """초안으로만 있는 감정 id (검수 전)."""
    data = json.loads((_DIR / "emotions.json").read_text(encoding="utf-8"))
    extra = json.loads((_DIR / "drafts" / "emotions.json").read_text(encoding="utf-8"))["entries"]
    return [k for k in extra if k not in data]


def topic_ids() -> list[str]:
    """감정 id 목록 (emotions.json 순서)."""
    return list(emotions())


# 숲 친구 (frontend App.jsx의 friends와 같은 id·이름). 대화 질문의 {친구} 자리와 AI 응답 생성에 쓴다.
FRIEND_NAMES = {"lion": "라온", "rabbit": "보리", "bear": "두리"}
DEFAULT_FRIEND = "lion"


def friend_name(character: str | None) -> str:
    """받침이 있으면 '이'를 붙인 부르는 이름: 라온이, 보리, 두리 (동화 본문의 {친구}와 같은 규칙)."""
    name = FRIEND_NAMES.get(character or DEFAULT_FRIEND, FRIEND_NAMES[DEFAULT_FRIEND])
    code = ord(name[-1]) - 0xAC00
    return name + "이" if 0 <= code < 11172 and code % 28 else name


def named(text: str, character: str | None) -> str:
    """대화 질문(ask·again)의 {친구}를 친구 이름으로 바꾼다. 친구의 대사에는 {친구}를 쓰지 않는다."""
    return text.replace("{친구}", friend_name(character))
