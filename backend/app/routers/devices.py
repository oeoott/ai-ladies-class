"""기기 기록 연결과 산책 재개 (백엔드 2)."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import child_access, require_guardian, today_kst
from ..schemas import LinkDeviceIn, LinkDeviceOut, MovedCounts, TodayWalk
from ..store import Store, get_store

router = APIRouter(prefix="/children/{child_id}", tags=["기기 연결·산책 재개"])


@router.post("/link-device", response_model=LinkDeviceOut)
def link_device(child_id: str, body: LinkDeviceIn, guardian: dict = Depends(require_guardian),
                store: Store = Depends(get_store)):
    """기기로 쌓인 기록을 아이 프로필로 옮긴다. 여러 번 불러도 중복이 생기지 않는다.

    남의 기기 기록을 가져가지 못하게
    1. 보호자 토큰이 있고 그 보호자의 아이 프로필이어야 한다 (403).
    2. 기기 id는 프론트가 만드는 'device-' + UUID v4 형식만 받는다 (짐작할 수 없는 id, 422).
    3. 기기 id는 처음 연결한 프로필 하나에만 묶인다. 다른 보호자나 다른 프로필이면 409.
    4. 연결한 뒤에는 그 기기 id로 토큰 없이 기록을 읽거나 쓸 수 없다 (deps.check_child).
    """
    if store.get_child(guardian["id"], child_id) is None:
        raise HTTPException(403, "이 보호자의 아이 기록이 아니에요.")
    device = body.device_child_id
    claim = store.claim_device(device, guardian["id"], child_id)
    if (claim["guardian_id"], claim["child_id"]) != (guardian["id"], child_id):
        raise HTTPException(409, "이미 다른 프로필에 연결된 기기예요.")
    moved = store.move_child_records(device, child_id)  # 처음이든 다시 하든 남은 기록만 옮긴다
    return LinkDeviceOut(child_id=child_id, device_child_id=device, moved=MovedCounts(**moved))


@router.get("/walks/today", response_model=TodayWalk)
def today_walk(child_id: str = Depends(child_access), store: Store = Depends(get_store)):
    """오늘 진행 중인 산책과 step. 기기 child_id도 토큰 없이 쓸 수 있다(연결 전)."""
    today = today_kst()
    open_walks = [w for w in store.list_walks(child_id) if w.day == today and w.status == "inProgress"]
    return TodayWalk(walk=max(open_walks, key=lambda w: w.created_at, default=None))
