"""보호자 비밀번호 해시와 로그인 토큰(JWT).

- 비밀번호: hashlib.scrypt + 보호자마다 다른 salt. 원문은 저장하지 않는다.
- 토큰: HS256 JWT, 비밀키는 환경 변수 JWT_SECRET. 비어 있으면 로그인 기능을 쓰지 않는다.
"""
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from .. import config

TOKEN_DAYS = 14  # 보호자가 다시 로그인해야 하는 주기
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}
_ALGORITHM = "HS256"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        name, n, r, p, salt, digest = stored.split("$")
        if name != "scrypt":
            return False
        expected = _unb64(digest)
        actual = hashlib.scrypt(password.encode(), salt=_unb64(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# 없는 이메일로 로그인할 때도 같은 시간이 걸리도록 비교에 쓰는 해시
DUMMY_HASH = hash_password(secrets.token_hex(8))


def enabled() -> bool:
    return config.settings.auth_enabled


def make_token(guardian_id: str) -> str:
    now = datetime.now(timezone.utc)
    claims = {"sub": guardian_id, "iat": now, "exp": now + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(claims, config.settings.jwt_secret, algorithm=_ALGORITHM)


def read_token(token: str) -> str | None:
    """올바르고 만료되지 않은 토큰이면 보호자 id, 아니면 None."""
    if not enabled():
        return None
    try:
        claims = jwt.decode(token, config.settings.jwt_secret, algorithms=[_ALGORITHM], options={"require": ["sub", "exp"]})
    except jwt.PyJWTError:
        return None
    return claims["sub"] if isinstance(claims.get("sub"), str) else None
