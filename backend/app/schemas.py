from datetime import date as Date
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from .content import topic_ids


def _known_topic(value: str) -> str:
    if value not in topic_ids():
        raise ValueError("알 수 없는 감정이에요.")
    return value


# 감정 id. 목록은 content/emotions.json에서 읽으므로 감정을 추가해도 여기는 고치지 않는다.
TopicId = Annotated[str, AfterValidator(_known_topic)]
Level = Literal["basic", "expand"]
WalkStatus = Literal["inProgress", "completed", "stopped"]
InputMode = Literal["picture", "voice", "text"]


# ---------- 산책(하루 학습) ----------
class WalkStart(BaseModel):
    child_id: str
    topic_id: TopicId
    level: Level = "basic"
    day: Date | None = None  # 비우면 서버 날짜(한국 시간)
    review: bool = False  # 스티커판 복습이면 True (스티커 추가 없음)


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


class Walk(BaseModel):
    id: str
    child_id: str
    created_at: str = Field(default_factory=_now_iso)
    day: Date
    topic_id: TopicId
    level: Level
    review: bool
    step: int = 0  # 0 감정 탐색, 1 표정 거울, 2 동화
    status: WalkStatus = "inProgress"


class WalkComplete(BaseModel):
    walk: Walk
    sticker_given: bool
    sticker_count: int


# ---------- 학습 1: 감정 탐색 ----------
class EmotionLesson(BaseModel):
    topic_id: TopicId
    label: str
    clue: str
    words: list[str]
    multiple: bool  # 확장 과제는 여러 개 선택


class EmotionAnswer(BaseModel):
    selected: list[str] = Field(min_length=1)
    used_hint: bool = False


class EmotionResult(BaseModel):
    correct: bool
    feedback: str | None = None


# ---------- 학습 2: 표정 거울 ----------
class MirrorLesson(BaseModel):
    topic_id: TopicId
    label: str
    motion: str


class MirrorRecord(BaseModel):
    mode: Literal["camera", "touch"]
    score: float | None = Field(default=None, ge=0, le=100)  # AI 기준 확정 전에는 null
    skipped: bool = False


# ---------- 학습 3: 동화 + 대화 ----------
class TaleAction(BaseModel):
    label: str
    expression: str
    title: str
    event: str
    line: str


class StoryLesson(BaseModel):
    topic_id: TopicId
    title: str
    pages: list[str]
    situation: str
    explanation: str
    actions: list[TaleAction]


class StoryActionPick(BaseModel):
    action_index: int = Field(ge=0)


class TalkStart(BaseModel):
    conversation_id: str
    ask: str
    choices: list[str]


class TalkTurnIn(BaseModel):
    choice_index: int | None = Field(default=None, ge=0)
    text: str | None = Field(default=None, max_length=200)
    input_mode: InputMode = "picture"


class TalkTurnOut(BaseModel):
    reply: str
    finished: bool
    ask: str | None = None  # 다음 질문 (추가 대화)
    choices: list[str] | None = None
    fallback_to_picture: bool = False  # 인식 실패·차단 시 그림 선택으로 돌아감
    expression: str | None = None  # 친구 표정 (joy·surprise·sad·anger·neutral). 없으면 화면이 정함


# ---------- 보호자 계정 ----------
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=8, max_length=128)


class GuardianOut(BaseModel):
    id: str
    email: str


class AuthOut(BaseModel):
    token: str
    guardian: GuardianOut


# ---------- 아이 프로필: 별명·출생 연도·캐릭터만 (실명·사진 없음) ----------
Character = Literal["lion", "rabbit", "bear"]  # 프론트 App.jsx의 숲 친구 id


def _check_nickname(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError("별명을 입력해 주세요.")
    return value


def _check_birth_year(value: int | None) -> int | None:
    if value is None:
        return None
    this_year = Date.today().year
    if not this_year - 15 <= value <= this_year:
        raise ValueError("출생 연도를 확인해 주세요.")
    return value


class ChildIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # 다른 칸(이름, 사진 등)을 보내면 422
    nickname: str = Field(min_length=1, max_length=12)
    birth_year: int | None = None  # 선택
    character: Character = "lion"

    @field_validator("nickname")
    @classmethod
    def _nickname(cls, value):
        return _check_nickname(value)

    @field_validator("birth_year")
    @classmethod
    def _birth_year(cls, value):
        return _check_birth_year(value)


class ChildPatch(BaseModel):
    """보낸 칸만 바꾼다 (숲 친구 꾸미기 완료 → 별명·캐릭터)."""
    model_config = ConfigDict(extra="forbid")
    nickname: str | None = Field(default=None, min_length=1, max_length=12)
    birth_year: int | None = None
    character: Character | None = None

    @field_validator("nickname")
    @classmethod
    def _nickname(cls, value):
        return _check_nickname(value)

    @field_validator("birth_year")
    @classmethod
    def _birth_year(cls, value):
        return _check_birth_year(value)


class ChildOut(BaseModel):
    id: str
    nickname: str
    birth_year: int | None = None
    character: Character


# ---------- 레벨 테스트 (준비 산책) ----------
class PlacementAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: TopicId  # 찾을 표정
    picks: list[TopicId] = Field(min_length=1, max_length=4)  # 누른 순서대로
    used_hint: bool = False


class PlacementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[PlacementAnswer] = Field(min_length=1, max_length=5)
    level: Level  # 화면이 정한 level (힌트를 봤으면 basic, 아니면 expand)


class PlacementOut(PlacementIn):
    model_config = ConfigDict(extra="ignore")
    created_at: str


# ---------- 보호자 리포트 (대화 문장은 넣지 않음) ----------
class EmotionStat(BaseModel):
    topic_id: TopicId
    label: str
    answers: int
    correct: int
    accuracy: float | None  # 0~1, 기록이 없으면 null
    hint_used: int


class MirrorStat(BaseModel):
    records: int
    camera: int
    touch: int
    camera_ratio: float | None
    touch_ratio: float | None


class StoryStat(BaseModel):
    conversations: int
    turns: int
    voice_turns: int
    voice_ratio: float | None  # 대화 턴 중 말로 답한 비율
    fallback_to_picture: int  # 그림 선택으로 돌아간 횟수
    blocked: int  # Content Safety 차단 횟수
    generation_limited: int = 0  # 하루 생성 호출 제한(DAILY_GENERATION_LIMIT)에 걸려 그림 선택으로 돌아간 횟수


class WalkStat(BaseModel):
    completed: int  # 복습 제외
    reviews: int  # 복습으로 마친 산책


class Report(BaseModel):
    child_id: str
    from_day: Date
    to_day: Date
    walks: WalkStat
    emotion: list[EmotionStat]
    mirror: MirrorStat
    story: StoryStat
    sticker_days: list[str]


class MonthWalks(BaseModel):
    month: str  # "2026-11"
    walks: int  # 그 달에 산책한 날 수 (스티커 받은 날, 대시보드 달력과 같은 기준)


class MonthlyReport(BaseModel):
    child_id: str
    months: list[MonthWalks]  # 오래된 달부터, 마지막이 to


# ---------- 기기 기록 연결 ----------
# 프론트 App.jsx deviceChildId(): 'device-' + crypto.randomUUID() (UUID v4). 짐작하기 어려운 id만 연결을 받는다.
DEVICE_ID_PATTERN = r"^device-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


class LinkDeviceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_child_id: str = Field(pattern=DEVICE_ID_PATTERN)


class MovedCounts(BaseModel):
    walks: int = 0
    attempts: int = 0
    conversations: int = 0
    stickers: int = 0  # 프로필로 옮긴 스티커
    stickers_merged: int = 0  # 프로필에 같은 날짜가 있어 하나로 합친 스티커


class LinkDeviceOut(BaseModel):
    child_id: str
    device_child_id: str
    moved: MovedCounts


class TodayWalk(BaseModel):
    walk: Walk | None  # 오늘(한국 날짜) 진행 중인 가장 최근 산책, 없으면 null


class TalkStartIn(BaseModel):
    """대화 시작 (선택). 숲 친구 id만 받는다. 아이가 붙인 별명은 받지 않는다."""
    model_config = ConfigDict(extra="forbid")
    character: Character = "lion"
