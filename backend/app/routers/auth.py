"""보호자 가입·로그인 (백엔드 1). 로그인하지 않아도 기기 기록으로 산책할 수 있다."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import require_guardian
from ..schemas import AuthOut, Credentials, GuardianOut
from ..services import auth
from ..store import Store, get_store

router = APIRouter(prefix="/auth", tags=["보호자 계정"])
me_router = APIRouter(tags=["보호자 계정"])


def _ready() -> None:
    if not auth.enabled():
        raise HTTPException(503, "지금은 보호자 로그인을 쓸 수 없어요.")


def _out(guardian: dict) -> AuthOut:
    return AuthOut(token=auth.make_token(guardian["id"]),
                   guardian=GuardianOut(id=guardian["id"], email=guardian["email"]))


@router.post("/signup", response_model=AuthOut, status_code=201)
def signup(body: Credentials, store: Store = Depends(get_store)):
    _ready()
    guardian = store.create_guardian(body.email, auth.hash_password(body.password))
    if guardian is None:
        raise HTTPException(409, "이미 가입한 이메일이에요.")
    return _out(guardian)


@router.post("/login", response_model=AuthOut)
def login(body: Credentials, store: Store = Depends(get_store)):
    _ready()
    guardian = store.get_guardian_by_email(body.email)
    ok = auth.verify_password(body.password, guardian["password_hash"] if guardian else auth.DUMMY_HASH)
    if not (guardian and ok):  # 이메일이 없을 때와 비밀번호가 틀릴 때 같은 답
        raise HTTPException(401, "이메일과 비밀번호를 확인해 주세요.")
    return _out(guardian)


@me_router.get("/me", response_model=GuardianOut)
def me(guardian: dict = Depends(require_guardian)):
    return GuardianOut(id=guardian["id"], email=guardian["email"])
