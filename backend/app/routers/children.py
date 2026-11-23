"""아이 프로필 (백엔드 1). 보호자당 아이 1명.
별명·출생 연도(선택)·캐릭터만 받는다. 실명·사진은 받지 않는다."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import require_guardian
from ..schemas import ChildIn, ChildOut, ChildPatch
from ..store import Store, get_store

router = APIRouter(prefix="/children", tags=["아이 프로필"])


def _out(child: dict) -> ChildOut:
    return ChildOut(**{k: child.get(k) for k in ChildOut.model_fields})


@router.post("", response_model=ChildOut, status_code=201)
def create_child(body: ChildIn, guardian: dict = Depends(require_guardian), store: Store = Depends(get_store)):
    child = store.create_child(guardian["id"], **body.model_dump())
    if child is None:
        raise HTTPException(409, "이미 아이 프로필이 있어요.")
    return _out(child)


@router.get("", response_model=list[ChildOut])
def list_children(guardian: dict = Depends(require_guardian), store: Store = Depends(get_store)):
    """보호자당 아이 1명이라 0개 또는 1개."""
    children = sorted(store.list_children(guardian["id"]), key=lambda c: c["created_at"])
    return [_out(c) for c in children]


@router.patch("/{child_id}", response_model=ChildOut)
def update_child(child_id: str, body: ChildPatch, guardian: dict = Depends(require_guardian),
                 store: Store = Depends(get_store)):
    child = store.get_child(guardian["id"], child_id)
    if child is None:
        raise HTTPException(403, "이 보호자의 아이 기록이 아니에요.")
    child.update(body.model_dump(exclude_unset=True, exclude_none=True))
    store.save_child(child)
    return _out(child)
