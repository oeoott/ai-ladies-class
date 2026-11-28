from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .schemas import Walk
from .services import auth
from .store import Store, get_store

KST = timezone(timedelta(hours=9))
_bearer = HTTPBearer(auto_error=False)
_LOGIN = {"WWW-Authenticate": "Bearer"}


def today_kst():
    return datetime.now(KST).date()


# ---------- 보호자 ----------
def current_guardian(cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     store: Store = Depends(get_store)) -> dict | None:
    """토큰이 없으면 None(기기 기록으로 동작). 토큰이 있는데 올바르지 않으면 401."""
    if cred is None:
        return None
    guardian_id = auth.read_token(cred.credentials)
    guardian = store.get_guardian(guardian_id) if guardian_id else None
    if guardian is None:
        raise HTTPException(401, "다시 로그인해 주세요.", headers=_LOGIN)
    return guardian


def require_guardian(guardian: dict | None = Depends(current_guardian)) -> dict:
    if guardian is None:
        raise HTTPException(401, "로그인이 필요해요.", headers=_LOGIN)
    return guardian


# ---------- 아이 소유 확인 ----------
def check_child(child_id: str, guardian: dict | None, store: Store) -> None:
    """토큰이 있으면 그 보호자의 아이여야 한다(아니면 403).
    토큰이 없으면 기기 child_id로 보고 통과한다. 단 보호자 프로필 아이의 기록과
    프로필에 연결한 기기 id는 토큰이 있어야 한다(401)."""
    claim = store.get_device_claim(child_id) if child_id.startswith("device-") else None
    if guardian is None:
        if claim or store.find_child(child_id):
            raise HTTPException(401, "로그인이 필요해요.", headers=_LOGIN)
        return
    if claim:  # 연결한 기기 id는 연결한 보호자만 쓴다
        if claim["guardian_id"] != guardian["id"]:
            raise HTTPException(403, "이 보호자의 아이 기록이 아니에요.")
        return
    if store.get_child(guardian["id"], child_id) is None:
        raise HTTPException(403, "이 보호자의 아이 기록이 아니에요.")


def child_access(child_id: str, guardian: dict | None = Depends(current_guardian),
                 store: Store = Depends(get_store)) -> str:
    """경로에 child_id가 있는 API에 건다."""
    check_child(child_id, guardian, store)
    return child_id


# ---------- 산책·대화 ----------
def walk_or_404(walk_id: str, guardian: dict | None = Depends(current_guardian),
                store: Store = Depends(get_store)) -> Walk:
    walk = store.get_walk(walk_id)
    if walk is None:
        raise HTTPException(404, "산책 기록을 찾을 수 없어요.")
    check_child(walk.child_id, guardian, store)
    return walk


def open_walk(walk: Walk = Depends(walk_or_404)) -> Walk:
    if walk.status != "inProgress":
        raise HTTPException(409, "이미 끝난 산책이에요.")
    return walk


def conversation_or_404(conversation_id: str, guardian: dict | None = Depends(current_guardian),
                        store: Store = Depends(get_store)) -> dict:
    conv = store.get_conversation(conversation_id)
    if conv is None:
        raise HTTPException(404, "대화를 찾을 수 없어요.")
    check_child(conv["child_id"], guardian, store)
    return conv


def open_conversation(conv: dict = Depends(conversation_or_404), store: Store = Depends(get_store)) -> dict:
    """턴을 받을 대화: 그 산책이 아직 진행 중이어야 한다. 완료·중단된 산책이면 409 (프론트는 로컬 대본으로 이어 감)."""
    walk = store.get_walk(conv["walk_id"])
    if walk is None:
        raise HTTPException(404, "산책 기록을 찾을 수 없어요.")
    if walk.status != "inProgress":
        raise HTTPException(409, "이미 끝난 산책이에요.")
    return conv
