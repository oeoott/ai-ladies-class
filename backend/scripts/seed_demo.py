"""발표용 시연 데이터: 보호자 하나, 아이 하나, 최근 2주 산책 기록.

    cd backend
    # 메모리 저장소: 데이터를 채운 서버를 바로 띄운다 (끄면 사라짐)
    python scripts/seed_demo.py --serve            # http://localhost:8000, JWT_SECRET이 없으면 시연용 값을 씀
    # Cosmos: .env 또는 환경 변수의 STORE=cosmos, COSMOS_* 로 저장한다 (비밀번호를 꼭 정한다)
    python scripts/seed_demo.py --password '<시연 비밀번호>'

다시 실행하면 같은 이메일의 시연 계정을 탈퇴(services/account.py)로 모두 지우고 새로 만든다.
기록은 저장소 메서드로 바로 쓴다 (화면·API를 거치지 않음). 문장은 동화 대본(tales.json)에서 가져온다.

들어가는 기록 (오늘 = 0, 오늘은 비워 둬서 시연에서 직접 산책할 수 있다)
- 산책 10번(스티커 10장) + 복습 1번, 네 감정을 차례로. 첫 주는 기본, 레벨 테스트를 다시 한 뒤 둘째 주는 확장
- 학습 1: 바로 맞힌 날과 틀린 뒤 단서를 보고 맞힌 날 (슬픔이 가장 낮아 '더 연습해 볼 감정'에 나옴)
- 학습 2: 카메라 사용한 날과 안 한 날 (score는 AI 기준 전이라 null)
- 학습 3: 보기·말로 답하기 섞어서, 그림으로 돌아간 대화 2번, 한 번만 이야기하고 마친 대화 1번
"""
import argparse
import os
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # python scripts/seed_demo.py 로 실행해도 app을 찾게

from app import config  # noqa: E402
from app.content import tales  # noqa: E402
from app.services import account, auth  # noqa: E402
from app.store import Store, build_store  # noqa: E402

KST = timezone(timedelta(hours=9))
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "maeum-demo-2026"  # 메모리 저장소 시연에서만 기본값으로 쓴다
CHILD = {"nickname": "하늘", "birth_year": 2019, "character": "lion"}

# (며칠 전, 감정, 학습 1 답, 학습 2 방법, 행동, 대화 턴, 그림으로 돌아간 수, 복습)
# 학습 1: "ok" 바로 맞힘, "hint" 틀린 뒤 단서 보고 맞힘
# 대화 턴: (보기 번호, 입력 방식) 목록. 한 개면 '산책 마무리하기'로 한 번만 이야기하고 마침
PLAN = [
    (13, "joy", "ok", "touch", 0, [(0, "picture"), (0, "picture")], 0, False),
    (12, "surprise", "hint", "touch", 1, [(1, "picture"), (0, "voice")], 0, False),
    (10, "sad", "hint", "camera", 0, [(0, "picture"), (1, "picture")], 1, False),
    (9, "anger", "ok", "touch", 1, [(0, "picture"), (1, "picture")], 0, False),
    (8, "joy", "ok", "camera", 1, [(1, "voice"), (0, "picture")], 0, False),
    (7, "surprise", "ok", "camera", 0, [(0, "voice"), (1, "voice")], 0, False),
    (5, "sad", "hint", "touch", 1, [(1, "picture")], 0, False),
    (4, "anger", "ok", "camera", 0, [(1, "voice"), (0, "picture")], 1, False),
    (2, "joy", "ok", "camera", 0, [(0, "voice"), (1, "picture")], 0, False),
    (1, "surprise", "ok", "touch", 1, [(0, "picture"), (0, "voice")], 0, False),
    (1, "sad", "ok", "touch", 0, [(1, "picture"), (1, "picture")], 0, True),
]
RETEST_DAYS_AGO = 8  # 이날부터 확장 과제


def _at(day: date, hour: int) -> str:
    return datetime.combine(day, time(hour), KST).astimezone(timezone.utc).isoformat()


def _words(topic_id: str, level: str) -> tuple[list[str], list[str]]:
    from app.content import emotions

    e = emotions()[topic_id]
    right = [e["word"], e["kin"]] if level == "expand" else [e["word"]]
    return right, [e["opposite"]]


def seed(store: Store, today: date, password: str = DEMO_PASSWORD, email: str = DEMO_EMAIL) -> dict:
    """시연 계정을 (있으면 지우고) 새로 만든다. 만든 보호자·아이 id와 기록 수를 돌려준다."""
    old = store.get_guardian_by_email(email)
    if old:
        account.delete_account(store, old)
    guardian = store.create_guardian(email, auth.hash_password(password))
    child = store.create_child(guardian["id"], **CHILD)
    child_id = child["id"]

    store.add_placement(child_id, [{"target": "joy", "picks": ["sad", "joy"], "used_hint": True},
                                   {"target": "surprise", "picks": ["surprise"], "used_hint": False}], "basic")
    retested = False
    counts = {"walks": 0, "reviews": 0, "conversations": 0}
    for days_ago, topic_id, answer, mirror, action, turns, fallbacks, review in PLAN:
        day = today - timedelta(days=days_ago)
        if days_ago <= RETEST_DAYS_AGO and not retested:
            store.add_placement(child_id, [{"target": "joy", "picks": ["joy"], "used_hint": False},
                                           {"target": "surprise", "picks": ["surprise"], "used_hint": False}], "expand")
            retested = True
        level = "expand" if days_ago <= RETEST_DAYS_AGO else "basic"
        walk = store.create_walk(child_id=child_id, topic_id=topic_id, level=level, day=day, review=review,
                                 created_at=_at(day, 16))
        right, wrong = _words(topic_id, level)
        if answer == "hint":
            store.add_attempt(walk, "emotion", selected=wrong, correct=False, used_hint=False, created_at=_at(day, 16))
        store.add_attempt(walk, "emotion", selected=right, correct=True, used_hint=answer == "hint", created_at=_at(day, 16))
        store.add_attempt(walk, "mirror", mode=mirror, score=None, skipped=False, created_at=_at(day, 16))
        store.add_attempt(walk, "story_action", action_index=action, created_at=_at(day, 16))

        talk = tales()[topic_id]["talk"]
        conv = store.create_conversation(walk, friend=CHILD["character"])
        for turn, (choice, mode) in enumerate(turns):
            said = (talk["choices"] if turn == 0 else talk["extra"])[choice]
            reply = (talk["replies"] if turn == 0 else talk["ends"])[choice]
            conv["turns"].append({"said": said, "reply": reply, "input_mode": mode})
        conv.update(turn=len(turns), fallbacks=fallbacks, created_at=_at(day, 16),
                    ended_by="maxTurns" if len(turns) == 2 else "button")
        store.save_conversation(conv)

        walk.step, walk.status = 2, "completed"
        store.save_walk(walk)
        if not review:
            store.give_sticker(child_id, day)
        counts["reviews" if review else "walks"] += 1
        counts["conversations"] += 1
    return {"guardian_id": guardian["id"], "child_id": child_id, "email": email, **counts}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="발표용 시연 데이터 (보호자 하나, 아이 하나, 최근 2주)")
    parser.add_argument("--serve", action="store_true", help="메모리 저장소에 채우고 서버를 바로 띄운다")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--password", default=os.environ.get("DEMO_PASSWORD", ""))
    args = parser.parse_args(argv)

    from app import store as store_module

    settings = config.settings
    if args.serve:
        if settings.store != "memory":
            parser.error("--serve는 메모리 저장소(STORE=memory)에서만 씁니다.")
        if not settings.jwt_secret:  # 보호자 로그인을 시연하려면 필요
            settings = config.Settings(**{**settings.__dict__, "jwt_secret": "demo-only-secret-change-me-0123456789"})
            config.settings = settings
    elif settings.store == "memory":
        parser.error("메모리 저장소는 이 프로세스가 끝나면 사라집니다. --serve로 서버와 함께 띄우거나 STORE=cosmos로 실행하세요.")
    password = args.password or (DEMO_PASSWORD if settings.store == "memory" else "")
    if len(password) < 8:
        parser.error("Cosmos에 넣을 때는 --password(또는 DEMO_PASSWORD)로 8자 이상 비밀번호를 정하세요.")

    store = build_store(settings)
    result = seed(store, datetime.now(KST).date(), password)
    print(f"시연 계정 {result['email']} / 아이 {CHILD['nickname']} / 산책 {result['walks']}번, 복습 {result['reviews']}번")
    if args.serve:
        import uvicorn

        from app.main import app

        store_module._store = store  # 서버가 이 저장소를 쓰게 한다
        print(f"비밀번호 {password} · http://localhost:{args.port}/docs")
        uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
