"""탈퇴 (DELETE /me): 계정·아이·모든 기록·이메일 문서·기기 연결을 지우고, 중간에 실패해도 다시 하면 남는 것이 없다."""
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.store import MemoryStore, get_store
from app.store_cosmos import CosmosStore

from .fake_cosmos import FakeDatabase
from .test_auth import PASSWORD, SECRET
from .test_devices import DEVICE, OTHER_DEVICE, Faulty, device_walk, guardian, link, make_client, setup_family


@pytest.fixture(autouse=True)
def with_secret(monkeypatch):
    monkeypatch.setattr(config, "settings", config.Settings(jwt_secret=SECRET))
    yield
    app.dependency_overrides.clear()


def everything(store) -> set:
    """저장소의 모든 문서 (어느 집 것인지 상관없이)."""
    if isinstance(store, MemoryStore):
        return ({("guardians", k) for k in store.guardians} | {("emails", k) for k in store.guardian_emails}
                | {("children", k) for k in store.children} | {("walks", k) for k in store.walks}
                | {("attempts", a["id"]) for a in store.attempts} | {("conversations", k) for k in store.conversations}
                | {("stickers", k) for k in store.stickers} | {("device_links", k) for k in store.device_links})
    return {(name, key) for name, container in store._c.items() for key in container.items}


def other_family(c):
    """지우지 않을 다른 집: 다른 이메일, 다른 기기."""
    device_walk(c, "2026-11-20", child_id=OTHER_DEVICE)
    h, child_id = guardian(c, email="other@example.com")
    assert link(c, h, child_id, device=OTHER_DEVICE).status_code == 200
    device_walk(c, "2026-11-21", child_id=child_id, headers=h)
    return h


def delete(c, headers, password=PASSWORD):
    return c.request("DELETE", "/me", json={"password": password}, headers=headers)


@pytest.fixture(params=["memory", "cosmos"])
def env(request):
    store = MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())
    return make_client(store), store


def test_delete_removes_account_child_records_email_and_device_link(env):
    c, store = env
    other_h = other_family(c)
    kept = everything(store)
    h, child_id = setup_family(c)
    assert link(c, h, child_id).status_code == 200

    out = delete(c, h)
    assert out.status_code == 200, out.text
    assert out.json()["deleted"] == {"children": 1, "device_links": 1, "walks": 3, "attempts": 10,
                                     "conversations": 3, "stickers": 2}
    assert everything(store) == kept  # 다른 집 문서만 남음

    assert c.get("/me", headers=h).status_code == 401  # 남은 토큰은 쓸 수 없음
    assert c.post("/auth/login", json={"email": "parent@example.com", "password": PASSWORD}).status_code == 401
    assert c.post("/auth/signup", json={"email": "Parent@Example.com", "password": PASSWORD}).status_code == 201
    assert c.get("/me", headers=other_h).status_code == 200
    # 기기 연결도 지워져서, 새로 가입한 집이 같은 기기 id를 다시 연결할 수 있다
    h2, child2 = guardian(c, email="new@example.com")
    assert link(c, h2, child2).status_code == 200


def test_wrong_password_deletes_nothing(env):
    c, store = env
    h, child_id = setup_family(c)
    before = everything(store)
    assert delete(c, h, password="wrong-password").status_code == 403
    assert c.request("DELETE", "/me", json={}, headers=h).status_code == 422
    assert c.request("DELETE", "/me", json={"password": PASSWORD}).status_code == 401  # 토큰 없음
    assert everything(store) == before


def test_delete_also_clears_records_left_on_a_half_linked_device():
    db = FakeDatabase()
    store = CosmosStore(db)
    c = make_client(store)
    h, child_id = setup_family(c)
    faulty = Faulty(db)
    faulty.count, faulty.fail_at = 0, 6  # 연결이 중간에 멈춰 기기 쪽에 기록이 남는다
    assert link(c, h, child_id).status_code == 500
    assert store.list_attempts(DEVICE) and store.get_device_claim(DEVICE)  # 산책은 옮겼고 학습 기록이 남음
    assert delete(c, h).status_code == 200
    assert everything(store) == set()


def build():
    db = FakeDatabase()
    store = CosmosStore(db)
    c = make_client(store)
    h, child_id = setup_family(c)
    assert link(c, h, child_id).status_code == 200
    return db, store, c, h


DELETE_WRITES = 22  # build()의 집을 지울 때 쓰기(삭제) 횟수 (test_count_delete_writes)


def test_count_delete_writes():
    db, store, c, h = build()
    faulty = Faulty(db)
    faulty.count = 0
    assert delete(c, h).status_code == 200
    # 아이 기록 (산책 3 + attempts 10 + 대화 3 + 스티커 2) + 기기 연결 1 + 아이 1 + 이메일 1 + 보호자 1
    assert faulty.count == DELETE_WRITES == 18 + 4


@pytest.mark.parametrize("fail_at", range(1, DELETE_WRITES + 1))
def test_delete_failing_at_any_write_then_retry_leaves_nothing(fail_at):
    db, store, c, h = build()
    faulty = Faulty(db)
    faulty.count, faulty.fail_at = 0, fail_at
    assert delete(c, h).status_code == 500  # 중간에 실패
    retry = delete(c, h)  # 같은 토큰·비밀번호로 다시 하기
    assert retry.status_code == 200, (fail_at, retry.text)
    assert everything(store) == set(), fail_at
    app.dependency_overrides.clear()


def test_delete_without_a_child_profile(env):
    c, store = env
    token = c.post("/auth/signup", json={"email": "solo@example.com", "password": PASSWORD}).json()["token"]
    out = delete(c, {"Authorization": f"Bearer {token}"})
    assert out.status_code == 200 and out.json()["deleted"]["children"] == 0
    assert everything(store) == set()


def test_device_records_stay_device_records_until_linked(env):
    """연결하지 않은 기기 기록은 계정 것이 아니라서 지우지 않는다 (프론트는 탈퇴 뒤 기기 id를 새로 만든다)."""
    c, store = env
    device_walk(c, "2026-11-22")
    h, _ = guardian(c)
    assert delete(c, h).status_code == 200
    assert store.list_walks(DEVICE)
