"""학습 2: 표정 거울.

영상과 얼굴 특징은 브라우저에서만 처리하고, 서버는 결과만 기록한다.
점수(score)는 AI 담당의 유사도 기준이 확정되기 전까지 null로 받는다.
"""
from fastapi import APIRouter, Depends

from ..content import emotions
from ..deps import open_walk
from ..schemas import MirrorLesson, MirrorRecord, TopicId, Walk
from ..store import Store, get_store

router = APIRouter(prefix="/lessons/mirror", tags=["학습 2 표정 거울"])


@router.get("/{topic_id}", response_model=MirrorLesson)
def lesson(topic_id: TopicId):
    f = emotions()[topic_id]
    return MirrorLesson(topic_id=topic_id, label=f["label"], motion=f["motion"])


@router.post("/walks/{walk_id}/record")
def record(body: MirrorRecord, walk: Walk = Depends(open_walk), store: Store = Depends(get_store)):
    row = store.add_attempt(walk, "mirror", **body.model_dump())
    if walk.step < 2:
        walk.step = 2
        store.save_walk(walk)
    return {"saved": row["id"], "step": walk.step}
