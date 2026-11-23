"""Azure Cosmos DB 저장소 (azure-cosmos SDK). STORE=cosmos일 때 쓴다.

컨테이너와 파티션 키
- guardian_emails /id       (id = 소문자로 정리한 이메일. 이메일마다 문서 하나 → 중복 가입 막기)
- guardians      /id        (보호자 계정)
- device_links   /id        (id = 기기 child_id. 기기마다 문서 하나 → 처음 연결한 프로필만 가져간다)
- children       /guardian_id (고유 키 /guardian_id: 보호자 파티션에 문서 하나 → 보호자당 아이 1명.
                  보호자 id와 아이 id로 바로 읽어 소유를 확인한다)
- walks, attempts, conversations, stickers   /child_id (아이 기록)

Cosmos의 id와 고유 키는 논리 파티션 안에서만 중복을 막는다. 그래서 중복을 막을 값(이메일,
child_id_날짜)을 id로 쓰고, 그 값이 곧 파티션이 되거나(guardian_emails) 같은 파티션에 들어가게(stickers) 한다.

stickers 문서 id는 child_id_날짜다. 같은 파티션에 같은 id는 하나만 만들어지므로
동시에 완료 요청이 와도 스티커는 한 장만 생긴다.
"""
import logging
from urllib.parse import urlparse

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.exceptions import CosmosResourceExistsError, CosmosResourceNotFoundError

from . import config
from .schemas import Walk
from .store import (Store, device_claim, empty_counts, latest, new_conversation, new_id, normalize_email, now_iso,
                    placement_doc, sticker_id)

log = logging.getLogger("maeum.store")

CONTAINERS = {
    "guardian_emails": {"partition_key": "/id"},
    "device_links": {"partition_key": "/id"},
    "guardians": {"partition_key": "/id"},
    "children": {"partition_key": "/guardian_id", "unique_keys": ["/guardian_id"]},
    "walks": {"partition_key": "/child_id"},
    "attempts": {"partition_key": "/child_id"},
    "conversations": {"partition_key": "/child_id"},
    "stickers": {"partition_key": "/child_id"},
}


def is_local_emulator(endpoint: str) -> bool:
    """로컬 에뮬레이터는 자체 서명 인증서라 Python SDK가 검증하지 못한다. 이 PC 주소일 때만 검증을 끈다."""
    return urlparse(endpoint).hostname in ("localhost", "127.0.0.1")


def _clean(doc: dict | None) -> dict | None:
    """Cosmos가 붙이는 _rid, _etag, _ts 같은 값을 뺀다."""
    return None if doc is None else {k: v for k, v in doc.items() if not k.startswith("_")}


class CosmosStore(Store):
    def __init__(self, database) -> None:
        """database: azure.cosmos DatabaseProxy (테스트에서는 같은 메서드를 가진 가짜)."""
        self._c = {}
        for name, spec in CONTAINERS.items():
            kwargs = {}
            if spec.get("unique_keys"):  # 고유 키는 컨테이너를 만들 때만 정할 수 있다
                kwargs["unique_key_policy"] = {"uniqueKeys": [{"paths": spec["unique_keys"]}]}
            self._c[name] = database.create_container_if_not_exists(
                id=name, partition_key=PartitionKey(path=spec["partition_key"]), **kwargs)

    @classmethod
    def from_settings(cls, settings: config.Settings) -> "CosmosStore":
        if not settings.cosmos_enabled:
            raise RuntimeError("STORE=cosmos에는 COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE가 필요해요.")
        client = CosmosClient(settings.cosmos_endpoint, credential=settings.cosmos_key,
                              connection_verify=not is_local_emulator(settings.cosmos_endpoint))
        return cls(client.create_database_if_not_exists(id=settings.cosmos_database))

    # --- 공통 ---
    def _query(self, container: str, partition_key: str | None = None, **equals) -> list[dict]:
        where = " AND ".join(f"c.{name} = @{name}" for name in equals)
        query = "SELECT * FROM c" + (f" WHERE {where}" if where else "")
        params = [{"name": f"@{name}", "value": value} for name, value in equals.items()]
        if partition_key is None:
            items = self._c[container].query_items(query=query, parameters=params, enable_cross_partition_query=True)
        else:
            items = self._c[container].query_items(query=query, parameters=params, partition_key=partition_key)
        return [_clean(item) for item in items]

    def _read(self, container: str, item_id: str, partition_key: str) -> dict | None:
        try:
            return _clean(self._c[container].read_item(item=item_id, partition_key=partition_key))
        except CosmosResourceNotFoundError:
            return None

    # --- 보호자 ---
    def create_guardian(self, email, password_hash):
        email = normalize_email(email)
        doc = {"id": new_id(), "email": email, "password_hash": password_hash, "created_at": now_iso()}
        try:  # 이메일 문서를 먼저 만든다. 같은 이메일이면 여기서 409
            self._c["guardian_emails"].create_item({"id": email, "guardian_id": doc["id"], "created_at": doc["created_at"]})
        except CosmosResourceExistsError:
            return None
        try:
            self._c["guardians"].create_item(doc)
        except Exception:
            # 계정 저장이 실패하면 이메일 문서를 지워 같은 이메일로 다시 가입할 수 있게 한다
            try:
                self._c["guardian_emails"].delete_item(item=email, partition_key=email)
            except Exception as error:  # 지우기도 실패하면 로그만 남기고 원래 오류를 올린다 (이메일은 적지 않음)
                log.error("이메일 문서 정리 실패: %s", type(error).__name__)
            raise
        return doc

    def get_guardian(self, guardian_id):
        return self._read("guardians", guardian_id, guardian_id)

    def get_guardian_by_email(self, email):
        email = normalize_email(email)
        link = self._read("guardian_emails", email, email)
        return self.get_guardian(link["guardian_id"]) if link else None

    # --- 아이 프로필 ---
    def create_child(self, guardian_id, **profile):
        doc = {"id": new_id(), "guardian_id": guardian_id, **profile, "created_at": now_iso()}
        try:
            self._c["children"].create_item(doc)
        except CosmosResourceExistsError:  # 고유 키(/guardian_id): 이미 아이가 있다
            return None
        return doc

    def get_child(self, guardian_id, child_id):
        return self._read("children", child_id, guardian_id)

    def find_child(self, child_id):
        found = self._query("children", id=child_id)
        return found[0] if found else None

    def list_children(self, guardian_id):
        return self._query("children", partition_key=guardian_id)

    def save_child(self, child):
        self._c["children"].upsert_item(child)

    # --- 산책 ---
    def create_walk(self, **data):
        walk = Walk(id=new_id(), **data)
        self.save_walk(walk)
        return walk

    def get_walk(self, walk_id):
        found = self._query("walks", id=walk_id)
        return Walk.model_validate(found[0]) if found else None

    def save_walk(self, walk):
        self._c["walks"].upsert_item(walk.model_dump(mode="json"))

    def list_walks(self, child_id):
        return [Walk.model_validate(d) for d in self._query("walks", partition_key=child_id)]

    # --- 학습 기록 ---
    def add_attempt(self, walk, kind, **data):
        row = {"id": new_id(), "child_id": walk.child_id, "walk_id": walk.id, "kind": kind,
               "created_at": now_iso(), **data}
        self._c["attempts"].create_item(row)
        return row

    def list_attempts(self, child_id):
        return self._query("attempts", partition_key=child_id)

    def add_placement(self, child_id, answers, level):
        row = placement_doc(child_id, answers, level)
        self._c["attempts"].create_item(row)
        return row

    def latest_placement(self, child_id):
        return latest(self._query("attempts", partition_key=child_id, kind="placement"))

    # --- 대화 ---
    def create_conversation(self, walk, friend="lion"):
        conv = new_conversation(walk, friend)
        self._c["conversations"].create_item(conv)
        return conv

    def get_conversation(self, conversation_id):
        found = self._query("conversations", id=conversation_id)
        return found[0] if found else None

    def save_conversation(self, conv):
        self._c["conversations"].upsert_item(conv)

    def list_conversations(self, child_id):
        return self._query("conversations", partition_key=child_id)

    # --- 기기 기록 연결 ---
    def claim_device(self, device_child_id, guardian_id, child_id):
        doc = device_claim(device_child_id, guardian_id, child_id)
        try:
            self._c["device_links"].create_item(doc)
        except CosmosResourceExistsError:  # 이미 누가 연결했다: 덮어쓰지 않고 그 연결을 돌려준다
            return self._read("device_links", device_child_id, device_child_id)
        return doc

    def get_device_claim(self, device_child_id):
        return self._read("device_links", device_child_id, device_child_id)

    def _delete(self, container, item_id, partition_key):
        try:
            self._c[container].delete_item(item=item_id, partition_key=partition_key)
        except CosmosResourceNotFoundError:  # 앞선 시도에서 이미 지웠다
            pass

    def move_child_records(self, from_child_id, to_child_id):
        """파티션을 넘는 트랜잭션이 없으므로 문서마다 '프로필 파티션에 같은 id로 upsert → 기기 파티션에서 삭제'.
        중간에 실패해도 다시 부르면 기기 파티션에 남은 문서만 다시 옮긴다."""
        moved = empty_counts()
        for name in ("walks", "attempts", "conversations"):
            for doc in self._query(name, partition_key=from_child_id):
                self._c[name].upsert_item({**doc, "child_id": to_child_id})
                self._delete(name, doc["id"], from_child_id)
                moved[name] += 1
        for doc in self._query("stickers", partition_key=from_child_id):
            target = {**doc, "id": sticker_id(to_child_id, doc["day"]), "child_id": to_child_id}
            try:
                self._c["stickers"].create_item(target)
                moved["stickers"] += 1
            except CosmosResourceExistsError:  # 프로필에 같은 날짜가 있다 (또는 앞선 시도에서 옮겼다)
                moved["stickers_merged"] += 1
            self._delete("stickers", doc["id"], from_child_id)
        return moved

    # --- 탈퇴 (문서마다 지운다. 앞선 시도에서 지운 문서는 _delete가 넘어간다) ---
    def delete_child_records(self, child_id):
        deleted = {}
        for name in ("walks", "attempts", "conversations", "stickers"):
            docs = self._query(name, partition_key=child_id)
            for doc in docs:
                self._delete(name, doc["id"], child_id)
            deleted[name] = len(docs)
        return deleted

    def list_device_claims(self, child_id):
        return self._query("device_links", child_id=child_id)  # 기기 id 파티션이라 교차 파티션

    def delete_device_claim(self, device_child_id):
        self._delete("device_links", device_child_id, device_child_id)

    def delete_child(self, guardian_id, child_id):
        self._delete("children", child_id, guardian_id)

    def delete_guardian(self, guardian_id, email):
        email = normalize_email(email)
        link = self._read("guardian_emails", email, email)
        if link and link["guardian_id"] == guardian_id:
            self._delete("guardian_emails", email, email)
        self._delete("guardians", guardian_id, guardian_id)

    # --- 스티커 ---
    def give_sticker(self, child_id, day):
        doc = {"id": sticker_id(child_id, day), "child_id": child_id, "day": str(day), "created_at": now_iso()}
        try:
            self._c["stickers"].create_item(doc)  # upsert가 아니라 create: 이미 있으면 409
        except CosmosResourceExistsError:
            return False
        return True

    def sticker_days(self, child_id):
        return sorted(d["day"] for d in self._query("stickers", partition_key=child_id))
