"""azure-cosmos DatabaseProxy·ContainerProxy를 흉내 내는 가짜. 실제 SDK 예외를 그대로 던진다.

CosmosStore가 쓰는 메서드만 있다: create_container_if_not_exists, create_item, upsert_item,
replace_item(etag 조건), delete_item, read_item, query_items. 저장할 때마다 _etag가 바뀐다. 쿼리는 `WHERE c.이름 = @이름 AND ...` 모양만 이해한다.
"""
import copy
import re
import threading

from azure.core import MatchConditions
from azure.cosmos.exceptions import (CosmosAccessConditionFailedError, CosmosResourceExistsError,
                                     CosmosResourceNotFoundError)

_WHERE = re.compile(r"c\.(\w+) = @(\w+)")


class FakeContainer:
    def __init__(self, name, partition_key, unique_keys=()):
        self.name = name
        self.pk_field = partition_key.path.lstrip("/")
        self.unique_keys = [path.lstrip("/") for path in unique_keys]
        self.items: dict[tuple, dict] = {}  # (파티션 값, id) -> 문서
        self.queries: list[dict] = []
        self._lock = threading.Lock()
        self._version = 0

    def _key(self, doc):
        assert self.pk_field in doc, f"{self.name}: 파티션 키 {self.pk_field}가 없는 문서"
        return doc[self.pk_field], doc["id"]

    def _stored(self, doc):
        self._version += 1
        return {**copy.deepcopy(doc), "_rid": "r", "_etag": f"e{self._version}", "_ts": 1}

    def replace_item(self, item, body, etag=None, match_condition=None):
        with self._lock:
            key = self._key(body)
            assert key[1] == item
            current = self.items.get(key)
            if current is None:
                raise CosmosResourceNotFoundError(status_code=404, message="Not found")
            if match_condition == MatchConditions.IfNotModified and current["_etag"] != etag:
                raise CosmosAccessConditionFailedError(status_code=412, message="Precondition failed")
            self.items[key] = self._stored(body)
            return copy.deepcopy(self.items[key])

    def create_item(self, body):
        with self._lock:
            key = self._key(body)
            clash = key in self.items or any(
                other[self.pk_field] == body[self.pk_field] and all(other.get(u) == body.get(u) for u in self.unique_keys)
                for other in self.items.values() if self.unique_keys)
            if clash:
                raise CosmosResourceExistsError(status_code=409, message="Conflict")
            self.items[key] = self._stored(body)
            return copy.deepcopy(self.items[key])

    def upsert_item(self, body):
        with self._lock:
            self.items[self._key(body)] = self._stored(body)
            return copy.deepcopy(self.items[self._key(body)])

    def delete_item(self, item, partition_key):
        with self._lock:
            if self.items.pop((partition_key, item), None) is None:
                raise CosmosResourceNotFoundError(status_code=404, message="Not found")

    def read_item(self, item, partition_key):
        found = self.items.get((partition_key, item))
        if found is None:
            raise CosmosResourceNotFoundError(status_code=404, message="Not found")
        return copy.deepcopy(found)

    def query_items(self, query, parameters=None, partition_key=None, enable_cross_partition_query=None):
        if partition_key is None:
            assert enable_cross_partition_query, "파티션 키 없는 쿼리는 enable_cross_partition_query가 필요해요"
        values = {p["name"]: p["value"] for p in parameters or []}
        conditions = [(field, values["@" + name]) for field, name in _WHERE.findall(query)]
        self.queries.append({"query": query, "partition_key": partition_key})
        for (pk, _), doc in list(self.items.items()):
            if partition_key is not None and pk != partition_key:
                continue
            if all(doc.get(field) == value for field, value in conditions):
                yield copy.deepcopy(doc)


class FakeDatabase:
    def __init__(self):
        self.containers: dict[str, FakeContainer] = {}

    def create_container_if_not_exists(self, id, partition_key, unique_key_policy=None, **_):
        unique = [p for k in (unique_key_policy or {}).get("uniqueKeys", []) for p in k["paths"]]
        return self.containers.setdefault(id, FakeContainer(id, partition_key, unique))
