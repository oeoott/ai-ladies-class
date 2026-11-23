"""보호자 가입·로그인, 아이 프로필, 아이 소유 확인 (백엔드 1)."""
import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.store import MemoryStore, get_store
from app.store_cosmos import CosmosStore

from .fake_cosmos import FakeDatabase

SECRET = "test-secret-0123456789-abcdefghijklmnop"
PASSWORD = "forest-walk-2026"
CHILD = {"nickname": "하늘", "birth_year": 2019, "character": "rabbit"}


@pytest.fixture(autouse=True)
def with_secret(monkeypatch):
    monkeypatch.setattr(config, "settings", config.Settings(jwt_secret=SECRET))


@pytest.fixture(params=["memory", "cosmos"])
def store(request):
    return MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())


@pytest.fixture
def c(store):
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app)
    app.dependency_overrides.clear()


def signup(c, email="parent@example.com"):
    res = c.post("/auth/signup", json={"email": email, "password": PASSWORD})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def add_child(c, headers, **kw):
    res = c.post("/children", json={**CHILD, **kw}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_signup_login_and_me(c, store):
    res = c.post("/auth/signup", json={"email": "Parent@Example.com", "password": PASSWORD})
    assert res.status_code == 201 and res.json()["guardian"]["email"] == "parent@example.com"
    headers = {"Authorization": f"Bearer {res.json()['token']}"}
    assert c.get("/me", headers=headers).json() == res.json()["guardian"]

    again = c.post("/auth/signup", json={"email": "PARENT@example.com", "password": PASSWORD})
    assert again.status_code == 409

    login = c.post("/auth/login", json={"email": " parent@EXAMPLE.com ".strip(), "password": PASSWORD})
    assert login.status_code == 200 and login.json()["guardian"]["id"] == res.json()["guardian"]["id"]


def test_password_is_stored_only_as_hash(c, store):
    signup(c)
    guardian = store.get_guardian_by_email("parent@example.com")
    assert PASSWORD not in json.dumps(guardian) and guardian["password_hash"].startswith("scrypt$")


def test_wrong_password_and_unknown_email_get_same_answer(c):
    signup(c)
    wrong = c.post("/auth/login", json={"email": "parent@example.com", "password": "not-the-password"})
    unknown = c.post("/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401 and wrong.json() == unknown.json()


@pytest.mark.parametrize("body", [
    {"email": "not-an-email", "password": PASSWORD},
    {"email": "parent@example.com", "password": "short"},
])
def test_signup_checks_input(c, body):
    assert c.post("/auth/signup", json=body).status_code == 422


def test_bad_or_expired_token_is_rejected(c):
    headers = signup(c)
    guardian_id = c.get("/me", headers=headers).json()["id"]
    past = datetime.now(timezone.utc) - timedelta(days=1)
    expired = jwt.encode({"sub": guardian_id, "exp": past}, SECRET, algorithm="HS256")
    forged = jwt.encode({"sub": guardian_id, "exp": past + timedelta(days=30)}, "other-secret-0123456789-abcdefghij",
                        algorithm="HS256")
    for token in (expired, forged, "garbage"):
        assert c.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert c.get("/me").status_code == 401


def test_without_jwt_secret_login_is_off_but_device_walks_work(c, monkeypatch):
    monkeypatch.setattr(config, "settings", config.Settings())
    assert c.post("/auth/signup", json={"email": "parent@example.com", "password": PASSWORD}).status_code == 503
    assert c.post("/walks", json={"child_id": "device-kid", "topic_id": "joy"}).status_code == 200


def test_child_profile_takes_only_nickname_birth_year_character(c):
    headers = signup(c)
    for extra in ({"name": "김하늘"}, {"photo": "data:image/png;base64,AAAA"}):
        assert c.post("/children", json={**CHILD, **extra}, headers=headers).status_code == 422
    for bad in ({"nickname": "  "}, {"birth_year": 1990}, {"character": "dragon"}):
        assert c.post("/children", json={**CHILD, **bad}, headers=headers).status_code == 422
    assert c.post("/children", json=CHILD).status_code == 401
    child_id = add_child(c, headers)
    assert c.get("/children", headers=headers).json() == [{"id": child_id, **CHILD}]


def test_birth_year_is_optional(c):
    headers = signup(c)
    res = c.post("/children", json={"nickname": "라온", "character": "lion"}, headers=headers)
    assert res.status_code == 201 and res.json()["birth_year"] is None


def test_one_child_per_guardian(c):
    headers = signup(c)
    first = add_child(c, headers)
    second = c.post("/children", json={**CHILD, "nickname": "바다"}, headers=headers)
    assert second.status_code == 409  # 두 번째 아이는 만들 수 없다
    assert [child["id"] for child in c.get("/children", headers=headers).json()] == [first]
    other = signup(c, "other@example.com")
    assert c.post("/children", json=CHILD, headers=other).status_code == 201  # 다른 보호자는 따로 1명


def test_one_child_even_with_concurrent_requests(store):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    barrier = Barrier(8)

    def create(i):
        barrier.wait()
        return store.create_child("g1", nickname=f"아이{i}", character="lion")

    with ThreadPoolExecutor(8) as pool:
        made = [child for child in pool.map(create, range(8)) if child]
    assert len(made) == 1 and len(store.list_children("g1")) == 1


def test_update_child_changes_only_sent_fields(c):
    owner, other = signup(c, "owner@example.com"), signup(c, "other@example.com")
    child_id = add_child(c, owner)
    res = c.patch(f"/children/{child_id}", json={"nickname": "보리", "character": "bear"}, headers=owner)
    assert res.status_code == 200
    assert res.json() == {"id": child_id, "nickname": "보리", "birth_year": CHILD["birth_year"], "character": "bear"}
    assert c.get("/children", headers=owner).json()[0]["nickname"] == "보리"
    assert c.patch(f"/children/{child_id}", json={"nickname": "x"}, headers=other).status_code == 403
    assert c.patch(f"/children/{child_id}", json={"nickname": "x"}).status_code == 401
    for bad in ({"name": "김하늘"}, {"nickname": " "}, {"character": "dragon"}):
        assert c.patch(f"/children/{child_id}", json=bad, headers=owner).status_code == 422


def test_guardian_sees_only_own_children(c):
    a, b = signup(c, "a@example.com"), signup(c, "b@example.com")
    add_child(c, a)
    assert c.get("/children", headers=b).json() == []


def walk_everything(c, headers, child_id):
    """한 아이로 산책 하나를 끝까지 만들고 각 단계의 id를 돌려준다."""
    wid = c.post("/walks", json={"child_id": child_id, "topic_id": "joy"}, headers=headers).json()["id"]
    conv = c.post(f"/lessons/story/walks/{wid}/talk", headers=headers).json()["conversation_id"]
    return wid, conv


def test_other_guardian_gets_403_everywhere(c):
    owner, other = signup(c, "owner@example.com"), signup(c, "other@example.com")
    child_id = add_child(c, owner)
    wid, conv = walk_everything(c, owner, child_id)

    attempts = [
        ("post", "/walks", {"child_id": child_id, "topic_id": "joy"}),
        ("get", f"/walks/{wid}", None),
        ("post", f"/walks/{wid}/stop", None),
        ("post", f"/walks/{wid}/complete", None),
        ("post", f"/lessons/emotion/walks/{wid}/answer", {"selected": ["기뻐요"]}),
        ("post", f"/lessons/mirror/walks/{wid}/record", {"mode": "touch", "score": None}),
        ("post", f"/lessons/story/walks/{wid}/action", {"action_index": 0}),
        ("post", f"/lessons/story/walks/{wid}/talk", None),
        ("post", f"/conversations/{conv}/turn", {"choice_index": 0}),
        ("post", f"/conversations/{conv}/end", None),
        ("get", f"/children/{child_id}/stickers", None),
    ]
    for method, path, body in attempts:
        res = getattr(c, method)(path, headers=other, **({"json": body} if body else {}))
        assert res.status_code == 403, (path, res.status_code)
        res = getattr(c, method)(path, **({"json": body} if body else {}))  # 토큰 없이 프로필 기록에 접근
        assert res.status_code == 401, (path, res.status_code)

    # 막힌 요청은 아무것도 바꾸지 않았다
    assert c.get(f"/walks/{wid}", headers=owner).json()["status"] == "inProgress"
    assert c.post(f"/conversations/{conv}/turn", json={"choice_index": 0}, headers=owner).status_code == 200
    assert c.post(f"/walks/{wid}/complete", headers=owner).json()["sticker_given"] is True


def test_token_with_device_child_id_is_403_and_device_mode_still_works(c):
    headers = signup(c)
    assert c.post("/walks", json={"child_id": "device-kid", "topic_id": "joy"}, headers=headers).status_code == 403
    wid = c.post("/walks", json={"child_id": "device-kid", "topic_id": "joy"}).json()["id"]
    assert c.post(f"/walks/{wid}/complete").json()["sticker_given"] is True
    assert c.get("/children/device-kid/stickers").json()["days"]
