"""보호자 이메일 중복 가입 막기. Cosmos 고유 키·id는 논리 파티션 안에서만 중복을 막는다."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from azure.cosmos import PartitionKey
from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceExistsError

from app.store import MemoryStore
from app.store_cosmos import CosmosStore

from .fake_cosmos import FakeContainer, FakeDatabase


@pytest.fixture(params=["memory", "cosmos"])
def store(request):
    return MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())


def test_fake_cosmos_blocks_duplicates_only_inside_a_partition():
    c = FakeContainer("t", PartitionKey(path="/pk"), unique_keys=["/email"])
    c.create_item({"id": "1", "pk": "a", "email": "x"})
    with pytest.raises(CosmosResourceExistsError):
        c.create_item({"id": "1", "pk": "a", "email": "y"})  # 같은 파티션, 같은 id
    with pytest.raises(CosmosResourceExistsError):
        c.create_item({"id": "2", "pk": "a", "email": "x"})  # 같은 파티션, 같은 고유 키
    c.create_item({"id": "1", "pk": "b", "email": "x"})  # 다른 파티션이면 id·고유 키가 같아도 들어간다
    assert len(c.items) == 2


def test_email_is_normalized_and_unique(store):
    first = store.create_guardian("  Parent@Example.COM ", "hash")
    assert first["email"] == "parent@example.com"
    assert store.create_guardian("parent@example.com", "other") is None
    assert store.create_guardian("PARENT@example.com", "other") is None
    assert store.get_guardian_by_email("Parent@Example.com")["id"] == first["id"]


def test_concurrent_signup_with_same_email_creates_one(store):
    n = 12
    barrier = Barrier(n)
    emails = ["kid.parent@example.com", "Kid.Parent@example.com", "KID.PARENT@EXAMPLE.COM"]

    def signup(i):
        barrier.wait()
        return store.create_guardian(emails[i % 3], "hash")

    with ThreadPoolExecutor(n) as pool:
        made = [g for g in pool.map(signup, range(n)) if g]
    assert len(made) == 1
    assert store.get_guardian(made[0]["id"])["email"] == "kid.parent@example.com"


def test_failed_account_save_removes_email_document(monkeypatch):
    db = FakeDatabase()
    store = CosmosStore(db)
    guardians = db.containers["guardians"]
    real_create = guardians.create_item

    def broken(body):
        raise CosmosHttpResponseError(status_code=503, message="Service unavailable")

    monkeypatch.setattr(guardians, "create_item", broken)
    with pytest.raises(CosmosHttpResponseError):
        store.create_guardian("Parent@Example.com", "hash")
    assert db.containers["guardian_emails"].items == {} and guardians.items == {}

    monkeypatch.setattr(guardians, "create_item", real_create)  # 저장소가 돌아오면 같은 이메일로 가입할 수 있다
    made = store.create_guardian("parent@example.com", "hash")
    assert made and store.get_guardian_by_email("PARENT@example.com")["id"] == made["id"]
