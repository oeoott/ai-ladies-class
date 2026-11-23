"""보호자 탈퇴 (DELETE /me). 보호자 계정, 아이 프로필, 모든 학습 기록, 이메일 문서, 기기 연결을 지운다.

지우는 순서 (보호자 계정을 맨 마지막에 지운다)
1. 아이마다: 아이 기록(산책·학습·대화·스티커)
2. 그 아이에 연결한 기기마다: 기기 쪽에 남은 기록(연결이 중간에 멈춘 경우) → 기기 연결 문서
3. 아이 프로필
4. 이메일 문서 → 보호자 계정

Cosmos에는 여러 문서를 한 번에 지우는 트랜잭션이 없다. 중간에 실패해도 보호자 계정이 남아 있으므로
같은 토큰과 비밀번호로 다시 부르면 남은 문서만 지운다 (없는 문서를 지우는 것은 오류가 아니다).
"""
from ..store import Store


def delete_account(store: Store, guardian: dict) -> dict:
    deleted = {"children": 0, "device_links": 0, "walks": 0, "attempts": 0, "conversations": 0, "stickers": 0}

    def add(counts: dict) -> None:
        for name, value in counts.items():
            deleted[name] += value

    for child in store.list_children(guardian["id"]):
        add(store.delete_child_records(child["id"]))
        for claim in store.list_device_claims(child["id"]):
            add(store.delete_child_records(claim["id"]))
            store.delete_device_claim(claim["id"])
            deleted["device_links"] += 1
        store.delete_child(guardian["id"], child["id"])
        deleted["children"] += 1
    store.delete_guardian(guardian["id"], guardian["email"])
    return deleted
