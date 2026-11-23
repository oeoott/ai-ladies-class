"""공통: 하루 한 감정 산책(학습 1→2→3)과 스티커."""
from fastapi import APIRouter, Depends

from ..content import emotions, topic_ids
from ..deps import check_child, child_access, current_guardian, open_walk, today_kst, walk_or_404
from ..schemas import Walk, WalkComplete, WalkStart
from ..store import Store, get_store

router = APIRouter(tags=["산책"])


@router.get("/topics")
def list_topics():
    return [{"id": t, "label": emotions()[t]["label"]} for t in topic_ids()]


@router.post("/walks", response_model=Walk)
def start_walk(body: WalkStart, guardian: dict | None = Depends(current_guardian), store: Store = Depends(get_store)):
    check_child(body.child_id, guardian, store)
    return store.create_walk(child_id=body.child_id, topic_id=body.topic_id, level=body.level,
                             review=body.review, day=body.day or today_kst())


@router.get("/walks/{walk_id}", response_model=Walk)
def get_walk(walk: Walk = Depends(walk_or_404)):
    return walk


@router.post("/walks/{walk_id}/stop", response_model=Walk)
def stop_walk(walk: Walk = Depends(open_walk), store: Store = Depends(get_store)):
    walk.status = "stopped"
    store.save_walk(walk)
    return walk


@router.post("/walks/{walk_id}/complete", response_model=WalkComplete)
def complete_walk(walk: Walk = Depends(open_walk), store: Store = Depends(get_store)):
    walk.status = "completed"
    store.save_walk(walk)
    # 같은 날짜는 스티커 1장, 복습은 스티커 없음
    given = False if walk.review else store.give_sticker(walk.child_id, walk.day)
    return WalkComplete(walk=walk, sticker_given=given, sticker_count=len(store.sticker_days(walk.child_id)))


@router.get("/children/{child_id}/stickers")
def stickers(child_id: str = Depends(child_access), store: Store = Depends(get_store)):
    return {"days": store.sticker_days(child_id)}
