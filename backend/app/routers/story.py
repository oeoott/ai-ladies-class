"""학습 3: 동화 속 역할놀이 + 친구와 대화."""
from fastapi import APIRouter, Depends, HTTPException

from ..content import tales
from ..deps import conversation_or_404, open_walk, today_kst
from ..schemas import StoryActionPick, StoryLesson, TaleAction, TalkStart, TalkTurnIn, TalkTurnOut, TopicId, Walk
from ..services import conversation
from ..store import Store, get_store

router = APIRouter(tags=["학습 3 동화·대화"])


@router.get("/lessons/story/{topic_id}", response_model=StoryLesson)
def lesson(topic_id: TopicId):
    t = tales()[topic_id]
    return StoryLesson(topic_id=topic_id, title=t["title"], pages=t["pages"], situation=t["situation"],
                       explanation=t["explanation"], actions=t["actions"])


@router.post("/lessons/story/walks/{walk_id}/action", response_model=TaleAction)
def pick_action(body: StoryActionPick, walk: Walk = Depends(open_walk), store: Store = Depends(get_store)):
    actions = tales()[walk.topic_id]["actions"]
    if body.action_index >= len(actions):
        raise HTTPException(422, "없는 행동이에요.")
    store.add_attempt(walk, "story_action", action_index=body.action_index)
    return actions[body.action_index]


@router.post("/lessons/story/walks/{walk_id}/talk", response_model=TalkStart)
def start_talk(walk: Walk = Depends(open_walk), store: Store = Depends(get_store)):
    conv = store.create_conversation(walk)
    ask, choices = conversation.opening(walk.topic_id)
    return TalkStart(conversation_id=conv["id"], ask=ask, choices=choices)


@router.post("/conversations/{conversation_id}/turn", response_model=TalkTurnOut)
def talk_turn(body: TalkTurnIn, conv: dict = Depends(conversation_or_404), store: Store = Depends(get_store)):
    if conv["ended_by"]:
        raise HTTPException(409, "이미 끝난 대화예요.")
    if body.choice_index is None and not body.text:
        raise HTTPException(422, "보기 번호나 문장이 필요해요.")

    # 비용 제한: 말·글 입력일 때만 그 아이의 오늘 생성 호출 수를 센다 (보기 선택은 생성하지 않음)
    day = str(today_kst())
    used = (conversation.generated_on(store.list_conversations(conv["child_id"]), day)
            if body.choice_index is None and body.text else 0)
    result = conversation.take_turn(conv, body.choice_index, body.text, day=day, generated_today=used)
    if result.get("fallback"):
        conv["fallbacks"] = conv.get("fallbacks", 0) + 1  # 리포트의 '그림으로 돌아간 수'
        store.save_conversation(conv)  # 차단 기록(safety)과 횟수(fallbacks, generated, limited)만 바뀐다
        return TalkTurnOut(reply="그림으로 골라 볼까요?", finished=False, choices=result["choices"],
                           fallback_to_picture=True)

    # 마스킹된 문장만 저장
    conv["turns"].append({"said": result["said"], "reply": result["reply"], "input_mode": body.input_mode})
    conv["turn"] += 1
    if conv["turn"] >= conversation.MAX_TURNS:
        conv["ended_by"] = "maxTurns"
        store.save_conversation(conv)
        return TalkTurnOut(reply=result["reply"], finished=True, expression=result.get("expression"))
    store.save_conversation(conv)
    talk = tales()[conv["topic_id"]]["talk"]
    return TalkTurnOut(reply=result["reply"], finished=False, ask=talk["again"], choices=talk["extra"],
                       expression=result.get("expression"))


@router.post("/conversations/{conversation_id}/end")
def end_talk(conv: dict = Depends(conversation_or_404), store: Store = Depends(get_store)):
    conv["ended_by"] = conv["ended_by"] or "button"
    store.save_conversation(conv)
    return {"ended_by": conv["ended_by"], "turns": len(conv["turns"])}
