"""학습 1: 감정 탐색 (표정 카드 단서 → 마음 낱말 고르기)."""
import random

from fastapi import APIRouter, Depends

from ..content import emotions
from ..deps import open_walk
from ..schemas import EmotionAnswer, EmotionLesson, EmotionResult, Level, TopicId, Walk
from ..store import Store, get_store

router = APIRouter(prefix="/lessons/emotion", tags=["학습 1 감정 탐색"])


def _words(topic_id: str, level: str) -> list[str]:
    f = emotions()[topic_id]
    return [f["word"], f["kin"], f["opposite"]] if level == "expand" else [f["word"], f["opposite"]]


@router.get("/{topic_id}", response_model=EmotionLesson)
def lesson(topic_id: TopicId, level: Level = "basic"):
    f = emotions()[topic_id]
    words = _words(topic_id, level)
    random.shuffle(words)
    return EmotionLesson(topic_id=topic_id, label=f["label"], clue=f["clue"], words=words, multiple=level == "expand")


@router.post("/walks/{walk_id}/answer", response_model=EmotionResult)
def answer(body: EmotionAnswer, walk: Walk = Depends(open_walk), store: Store = Depends(get_store)):
    f = emotions()[walk.topic_id]
    # 확장 과제는 화면과 같이 기본·비슷한 낱말 중 하나 이상을 고르면 정답
    allowed = {f["word"], f["kin"]} if walk.level == "expand" else {f["word"]}
    correct = set(body.selected) <= allowed if walk.level == "expand" else set(body.selected) == allowed
    store.add_attempt(walk, "emotion", selected=body.selected, correct=correct, used_hint=body.used_hint)
    if correct and walk.step < 1:
        walk.step = 1
        store.save_walk(walk)
    return EmotionResult(correct=correct, feedback=None if correct else f["clue"])
