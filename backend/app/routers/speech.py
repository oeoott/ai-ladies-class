"""Azure Speech (한국어 STT·TTS) 토큰. 보호자가 '음성 기능'에서 Azure를 고른 기기만 부른다.

- 접근: 학습 기록과 같은 규칙(deps.check_child): 토큰 없는 기기 child_id, 또는 보호자 토큰 + 그 보호자의 아이
- 호출 제한: 아이 한 명이 하루(한국 날짜)에 SPEECH_TOKENS_PER_DAY번까지 (store.reserve_generation의 별도 키)
- 응답: 10분짜리 토큰, 지역, 언어(ko-KR), TTS 음성. 키는 보내지 않는다. 캐시하지 않게 no-store.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

from .. import config
from ..deps import check_child, current_guardian, today_kst
from ..services import speech
from ..store import Store, get_store

router = APIRouter(tags=["음성 (Azure Speech)"])

SPEECH_TOKENS_PER_DAY = 60  # 9분마다 한 번이면 하루 9시간. 넘으면 429 → 화면은 문구 선택으로 이어 감


class SpeechTokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    child_id: str = Field(min_length=1, max_length=100)


class SpeechTokenOut(BaseModel):
    token: str
    region: str
    language: str
    voice: str
    expires_in: int


class SpeechStatus(BaseModel):
    available: bool
    language: str


def quota_key(day) -> str:
    """하루 호출 수 카운터의 키 (모델 생성 수와 같은 저장 방식, 다른 키)."""
    return f"speech-{day}"


@router.get("/speech/status", response_model=SpeechStatus)
def status():
    """서버에 Azure Speech 설정이 있는지. 실제 연결 확인은 토큰 발급으로 한다."""
    return SpeechStatus(available=config.settings.speech_enabled, language=speech.LANGUAGE)


@router.post("/speech/token", response_model=SpeechTokenOut)
def token(body: SpeechTokenIn, response: Response, guardian: dict | None = Depends(current_guardian),
          store: Store = Depends(get_store)):
    s = config.settings
    if not s.speech_enabled:
        raise HTTPException(503, "음성 기능이 설정되지 않았어요.")
    check_child(body.child_id, guardian, store)
    if not store.reserve_generation(body.child_id, quota_key(today_kst()), SPEECH_TOKENS_PER_DAY):
        raise HTTPException(429, "오늘은 음성 기능을 더 쓸 수 없어요.")
    issued = speech.issue_token()
    if issued is None:
        raise HTTPException(502, "음성 기능에 연결하지 못했어요.")
    response.headers["Cache-Control"] = "no-store"
    token_value, seconds = issued
    return SpeechTokenOut(token=token_value, region=s.speech_region, language=speech.LANGUAGE, voice=s.speech_voice,
                          expires_in=seconds)
