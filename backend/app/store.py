"""저장소 인터페이스와 메모리 구현.

라우터는 `Store`의 메서드만 쓴다. 구현은 환경 변수 STORE로 고른다.
- memory (기본값, 테스트): 이 파일의 MemoryStore
- cosmos: store_cosmos.py의 CosmosStore (Azure Cosmos DB)

문서 모양과 파티션 키는 backend/README.md의 '저장소' 절 참고.
"""
import copy
import threading
from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
from uuid import uuid4

from . import config
from .schemas import Walk


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid4().hex


def normalize_email(email: str) -> str:
    """가입·로그인·중복 확인에 쓰는 이메일. 앞뒤 공백을 빼고 소문자로 바꾼다."""
    return email.strip().lower()


def sticker_id(child_id: str, day: date | str) -> str:
    """스티커 문서 id. 아이·날짜마다 하나뿐이라 동시에 요청이 와도 한 장만 생긴다."""
    return f"{child_id}_{day}"


def placement_doc(child_id: str, answers: list[dict], level: str, created_at: str | None = None) -> dict:
    return {"id": new_id(), "child_id": child_id, "walk_id": None, "kind": "placement",
            "answers": answers, "level": level, "created_at": created_at or now_iso()}


def latest(rows) -> dict | None:
    return max(rows, key=lambda r: r["created_at"], default=None)


def device_claim(device_child_id: str, guardian_id: str, child_id: str) -> dict:
    return {"id": device_child_id, "guardian_id": guardian_id, "child_id": child_id, "created_at": now_iso()}


def empty_counts() -> dict:
    return {"walks": 0, "attempts": 0, "conversations": 0, "stickers": 0, "stickers_merged": 0}


def new_conversation(walk: Walk, friend: str = "lion") -> dict:
    # turns: 턴마다 {said(마스킹), reply, input_mode, resolved_by(button·exact·llm·fallback)}. fallback 턴은 문장 없음
    # safety: Content Safety 차단 기록 {blocked, categories}. 문장은 남기지 않는다.
    # generated: 한국 날짜별 Azure OpenAI 호출 수 (기록용), limited: 하루 제한에 걸린 수 (비용 제한)
    #   제한 판단은 이 칸이 아니라 reserve_generation(아이·날짜별 카운터)으로 한다
    # actions: 대화를 시작할 때까지 이 산책에서 고른 행동 번호(순서대로, 마지막이 지금 결과). 모델 문맥에 쓴다
    # rev: update_conversation의 비교 값 (동시 요청 막기)
    # (이전 문서의 fallbacks 칸은 그림으로 돌아간 수였다. 리포트가 함께 센다)
    return {"id": new_id(), "child_id": walk.child_id, "walk_id": walk.id, "topic_id": walk.topic_id,
            "friend": friend, "turn": 0, "turns": [], "safety": [], "generated": {}, "limited": 0,
            "actions": [], "ended_by": None, "rev": 0, "created_at": now_iso()}


class Store(ABC):
    """저장소 인터페이스. 돌려주는 값은 복사본이므로 바꾼 뒤에는 save_*로 저장한다."""

    # --- 보호자 ---
    @abstractmethod
    def create_guardian(self, email: str, password_hash: str) -> dict | None:
        """이메일은 normalize_email로 정리해 저장한다. 같은 이메일이 이미 있으면 None."""

    @abstractmethod
    def get_guardian(self, guardian_id: str) -> dict | None: ...

    @abstractmethod
    def get_guardian_by_email(self, email: str) -> dict | None: ...

    # --- 아이 프로필 ---
    @abstractmethod
    def create_child(self, guardian_id: str, **profile) -> dict | None:
        """보호자당 아이 1명. 이미 있으면 None (동시에 요청이 와도 하나만 생긴다)."""

    @abstractmethod
    def get_child(self, guardian_id: str, child_id: str) -> dict | None:
        """그 보호자의 아이가 아니면 None."""

    @abstractmethod
    def find_child(self, child_id: str) -> dict | None:
        """보호자와 관계없이 아이 프로필을 찾는다 (토큰 없는 요청이 프로필 기록에 닿는지 확인)."""

    @abstractmethod
    def list_children(self, guardian_id: str) -> list[dict]: ...

    @abstractmethod
    def save_child(self, child: dict) -> None: ...

    # --- 산책 ---
    @abstractmethod
    def create_walk(self, **data) -> Walk: ...

    @abstractmethod
    def get_walk(self, walk_id: str) -> Walk | None: ...

    @abstractmethod
    def save_walk(self, walk: Walk) -> None: ...

    @abstractmethod
    def list_walks(self, child_id: str) -> list[Walk]: ...

    # --- 학습 기록 ---
    @abstractmethod
    def add_attempt(self, walk: Walk, kind: str, **data) -> dict: ...

    @abstractmethod
    def list_attempts(self, child_id: str) -> list[dict]: ...

    # --- 레벨 테스트: attempts에 kind="placement"로 둔다 (아이 파티션, 기기 기록도 같은 방식) ---
    @abstractmethod
    def add_placement(self, child_id: str, answers: list[dict], level: str, created_at: str | None = None) -> dict:
        """created_at은 시연 데이터처럼 지난 날짜로 넣을 때만 준다."""

    @abstractmethod
    def latest_placement(self, child_id: str) -> dict | None: ...

    # --- 기기 기록 연결 ---
    @abstractmethod
    def claim_device(self, device_child_id: str, guardian_id: str, child_id: str) -> dict:
        """기기 id를 프로필에 묶는다. 처음 묶은 것만 남고, 이미 있으면 덮어쓰지 않고 기존 것을 돌려준다."""

    @abstractmethod
    def get_device_claim(self, device_child_id: str) -> dict | None: ...

    @abstractmethod
    def move_child_records(self, from_child_id: str, to_child_id: str) -> dict:
        """산책·기록(레벨 테스트 포함)·대화·스티커를 옮긴다. 문서마다 '복사 → 원본 삭제'라
        중간에 실패해도 다시 부르면 남은 것만 옮긴다(같은 id로 덮어써서 중복 없음).
        스티커는 프로필에 같은 날짜가 있으면 하나만 남긴다. 옮긴 수를 돌려준다."""

    # --- 탈퇴 (services/account.py가 순서대로 부른다. 없는 문서를 지워도 오류 없이 넘어간다) ---
    @abstractmethod
    def delete_child_records(self, child_id: str) -> dict:
        """그 아이 id의 산책·학습 기록·대화·스티커를 지운다. 지운 수 {walks, attempts, conversations, stickers}."""

    @abstractmethod
    def list_device_claims(self, child_id: str) -> list[dict]:
        """그 아이 프로필에 연결한 기기 연결 문서들."""

    @abstractmethod
    def delete_device_claim(self, device_child_id: str) -> None: ...

    @abstractmethod
    def delete_child(self, guardian_id: str, child_id: str) -> None: ...

    @abstractmethod
    def delete_guardian(self, guardian_id: str, email: str) -> None:
        """이메일 문서를 먼저, 보호자 계정을 마지막에 지운다."""

    # --- 대화 ---
    @abstractmethod
    def create_conversation(self, walk: Walk, friend: str = "lion") -> dict: ...

    @abstractmethod
    def get_conversation(self, conversation_id: str) -> dict | None: ...

    @abstractmethod
    def save_conversation(self, conv: dict) -> None:
        """그대로 덮어쓴다 (시연 데이터·테스트용). 턴 기록은 update_conversation을 쓴다."""

    @abstractmethod
    def update_conversation(self, conv: dict) -> bool:
        """읽었을 때의 rev와 저장된 rev가 같을 때만 저장하고 rev를 1 올린다 (conv["rev"]도 바뀐다).
        그사이 다른 요청이 먼저 저장했으면 저장하지 않고 False. 동시 요청으로 턴이 덮어써지는 것을 막는다."""

    @abstractmethod
    def list_conversations(self, child_id: str) -> list[dict]: ...

    # --- 하루 모델 호출 수 (비용 제한) ---
    @abstractmethod
    def reserve_generation(self, child_id: str, day: str, limit: int) -> bool:
        """그 아이의 day(한국 날짜) 호출 수가 limit보다 적으면 1 늘리고 True, 아니면 False.
        읽고 늘리기를 한 번에 해서, 동시에 와도 limit을 넘지 않는다."""

    @abstractmethod
    def generations_on(self, child_id: str, day: str) -> int:
        """그 아이가 day에 예약한 모델 호출 수."""

    # --- 스티커: 아이별 날짜당 1장 ---
    @abstractmethod
    def give_sticker(self, child_id: str, day: date) -> bool:
        """새로 줬으면 True, 그 날짜에 이미 있으면 False."""

    @abstractmethod
    def sticker_days(self, child_id: str) -> list[str]:
        """받은 날짜 (YYYY-MM-DD, 오름차순)."""


class MemoryStore(Store):
    """서버를 다시 켜면 비는 저장소. 테스트와 로컬 개발용."""

    def __init__(self) -> None:
        self._lock = threading.Lock()  # FastAPI는 동기 엔드포인트를 여러 스레드에서 돌린다
        self.guardians: dict[str, dict] = {}
        self.guardian_emails: dict[str, str] = {}  # 정리한 이메일 -> 보호자 id
        self.children: dict[str, dict] = {}
        self.walks: dict[str, Walk] = {}
        self.attempts: list[dict] = []  # 학습 1·2·3 기록
        self.conversations: dict[str, dict] = {}
        self.stickers: dict[str, dict] = {}  # sticker_id -> 문서
        self.device_links: dict[str, dict] = {}  # 기기 child_id -> 연결
        self.generations: dict[tuple[str, str], int] = {}  # (child_id, 날짜) -> 모델 호출 수

    # --- 보호자 ---
    def create_guardian(self, email, password_hash):
        email = normalize_email(email)
        with self._lock:
            if email in self.guardian_emails:
                return None
            doc = {"id": new_id(), "email": email, "password_hash": password_hash, "created_at": now_iso()}
            self.guardian_emails[email] = doc["id"]
            self.guardians[doc["id"]] = doc
            return copy.deepcopy(doc)

    def get_guardian(self, guardian_id):
        return copy.deepcopy(self.guardians.get(guardian_id))

    def get_guardian_by_email(self, email):
        guardian_id = self.guardian_emails.get(normalize_email(email))
        return self.get_guardian(guardian_id) if guardian_id else None

    # --- 아이 프로필 ---
    def create_child(self, guardian_id, **profile):
        with self._lock:
            if any(c["guardian_id"] == guardian_id for c in self.children.values()):
                return None
            doc = {"id": new_id(), "guardian_id": guardian_id, **profile, "created_at": now_iso()}
            self.children[doc["id"]] = doc
            return copy.deepcopy(doc)

    def get_child(self, guardian_id, child_id):
        child = self.children.get(child_id)
        return copy.deepcopy(child) if child and child["guardian_id"] == guardian_id else None

    def find_child(self, child_id):
        return copy.deepcopy(self.children.get(child_id))

    def list_children(self, guardian_id):
        return [copy.deepcopy(c) for c in self.children.values() if c["guardian_id"] == guardian_id]

    def save_child(self, child):
        self.children[child["id"]] = copy.deepcopy(child)

    # --- 산책 ---
    def create_walk(self, **data):
        walk = Walk(id=new_id(), **data)
        self.walks[walk.id] = walk.model_copy()
        return walk

    def get_walk(self, walk_id):
        walk = self.walks.get(walk_id)
        return walk.model_copy() if walk else None

    def save_walk(self, walk):
        self.walks[walk.id] = walk.model_copy()

    def list_walks(self, child_id):
        return [w.model_copy() for w in self.walks.values() if w.child_id == child_id]

    # --- 학습 기록 ---
    def add_attempt(self, walk, kind, **data):
        row = {"id": new_id(), "child_id": walk.child_id, "walk_id": walk.id, "kind": kind,
               "created_at": now_iso(), **data}
        self.attempts.append(row)
        return copy.deepcopy(row)

    def list_attempts(self, child_id):
        return [copy.deepcopy(a) for a in self.attempts if a["child_id"] == child_id]

    def add_placement(self, child_id, answers, level, created_at=None):
        row = placement_doc(child_id, answers, level, created_at)
        self.attempts.append(row)
        return copy.deepcopy(row)

    def latest_placement(self, child_id):
        return latest(a for a in self.list_attempts(child_id) if a["kind"] == "placement")

    # --- 대화 ---
    def create_conversation(self, walk, friend="lion"):
        conv = new_conversation(walk, friend)
        self.conversations[conv["id"]] = conv
        return copy.deepcopy(conv)

    def get_conversation(self, conversation_id):
        return copy.deepcopy(self.conversations.get(conversation_id))

    def save_conversation(self, conv):
        with self._lock:
            self.conversations[conv["id"]] = copy.deepcopy(conv)

    def update_conversation(self, conv):
        with self._lock:
            stored = self.conversations.get(conv["id"])
            if stored is None or stored.get("rev", 0) != conv.get("rev", 0):
                return False
            conv["rev"] = conv.get("rev", 0) + 1
            self.conversations[conv["id"]] = copy.deepcopy(conv)
            return True

    def list_conversations(self, child_id):
        return [copy.deepcopy(c) for c in self.conversations.values() if c["child_id"] == child_id]

    def reserve_generation(self, child_id, day, limit):
        with self._lock:
            used = self.generations.get((child_id, day), 0)
            if used >= limit:
                return False
            self.generations[(child_id, day)] = used + 1
            return True

    def generations_on(self, child_id, day):
        return self.generations.get((child_id, day), 0)

    # --- 기기 기록 연결 ---
    def claim_device(self, device_child_id, guardian_id, child_id):
        with self._lock:
            claim = self.device_links.setdefault(device_child_id, device_claim(device_child_id, guardian_id, child_id))
            return copy.deepcopy(claim)

    def get_device_claim(self, device_child_id):
        return copy.deepcopy(self.device_links.get(device_child_id))

    def move_child_records(self, from_child_id, to_child_id):
        moved = empty_counts()
        with self._lock:
            for walk in [w for w in self.walks.values() if w.child_id == from_child_id]:
                walk.child_id = to_child_id
                moved["walks"] += 1
            for row in [a for a in self.attempts if a["child_id"] == from_child_id]:
                row["child_id"] = to_child_id
                moved["attempts"] += 1
            for conv in [c for c in self.conversations.values() if c["child_id"] == from_child_id]:
                conv["child_id"] = to_child_id
                moved["conversations"] += 1
            for (child, day), n in [(k, v) for k, v in self.generations.items() if k[0] == from_child_id]:
                self.generations[(to_child_id, day)] = self.generations.get((to_child_id, day), 0) + n
                del self.generations[(child, day)]
            for key, doc in [(k, s) for k, s in self.stickers.items() if s["child_id"] == from_child_id]:
                target = sticker_id(to_child_id, doc["day"])
                if target in self.stickers:
                    moved["stickers_merged"] += 1
                else:
                    self.stickers[target] = {**doc, "id": target, "child_id": to_child_id}
                    moved["stickers"] += 1
                del self.stickers[key]
        return moved

    # --- 탈퇴 ---
    def delete_child_records(self, child_id):
        with self._lock:
            walks = [k for k, w in self.walks.items() if w.child_id == child_id]
            convs = [k for k, c in self.conversations.items() if c["child_id"] == child_id]
            stickers = [k for k, s in self.stickers.items() if s["child_id"] == child_id]
            attempts = sum(1 for a in self.attempts if a["child_id"] == child_id)
            for k in walks:
                del self.walks[k]
            for k in convs:
                del self.conversations[k]
            for k in stickers:
                del self.stickers[k]
            self.attempts = [a for a in self.attempts if a["child_id"] != child_id]
            for key in [k for k in self.generations if k[0] == child_id]:
                del self.generations[key]
        return {"walks": len(walks), "attempts": attempts, "conversations": len(convs), "stickers": len(stickers)}

    def list_device_claims(self, child_id):
        return [copy.deepcopy(c) for c in self.device_links.values() if c["child_id"] == child_id]

    def delete_device_claim(self, device_child_id):
        self.device_links.pop(device_child_id, None)

    def delete_child(self, guardian_id, child_id):
        with self._lock:
            child = self.children.get(child_id)
            if child and child["guardian_id"] == guardian_id:
                del self.children[child_id]

    def delete_guardian(self, guardian_id, email):
        with self._lock:
            email = normalize_email(email)
            if self.guardian_emails.get(email) == guardian_id:
                del self.guardian_emails[email]
            self.guardians.pop(guardian_id, None)

    # --- 스티커 ---
    def give_sticker(self, child_id, day):
        key = sticker_id(child_id, day)
        with self._lock:
            if key in self.stickers:
                return False
            self.stickers[key] = {"id": key, "child_id": child_id, "day": str(day), "created_at": now_iso()}
            return True

    def sticker_days(self, child_id):
        return sorted(s["day"] for s in self.stickers.values() if s["child_id"] == child_id)


def build_store(settings: config.Settings) -> Store:
    if settings.store == "cosmos":
        from .store_cosmos import CosmosStore  # azure-cosmos는 cosmos를 고를 때만 읽는다

        return CosmosStore.from_settings(settings)
    return MemoryStore()


_store: Store | None = None
_store_lock = threading.Lock()


def get_store() -> Store:
    """FastAPI 의존성. 처음 부를 때 설정(STORE)에 맞는 구현을 한 번 만든다."""
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                _store = build_store(config.settings)
    return _store
