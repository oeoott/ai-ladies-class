"""학습 3: 동화 속 역할놀이 + 친구와 대화."""
from fastapi import APIRouter, Depends, HTTPException

from ..content import named, tales
from ..deps import conversation_or_404, open_conversation, open_walk, today_kst
from ..schemas import StoryActionPick, StoryLesson, TaleAction, TalkStart, TalkStartIn, TalkTurnIn, TalkTurnOut, TopicId, Walk
from ..services import conversation, prompts
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
def start_talk(body: TalkStartIn | None = None, walk: Walk = Depends(open_walk), store: Store = Depends(get_store)):
    """body는 선택. 숲 친구 id(character)로 질문의 {친구}와 AI 응답의 친구 이름을 정한다 (없으면 라온)."""
    character = (body or TalkStartIn()).character
    conv = store.create_conversation(walk, friend=character)
    # 고른 행동은 /action이 story_action 기록으로 남긴다. 대화를 시작할 때 그 기록을 읽어 대화 문서에 둔다
    # (모델 문맥: 마지막이 지금 결과). 화면은 바뀌지 않는다.
    picked = sorted((a for a in store.list_attempts(walk.child_id)
                     if a.get("walk_id") == walk.id and a.get("kind") == "story_action"), key=lambda a: a["created_at"])
    if picked:
        conv["actions"] = [a["action_index"] for a in picked]
        store.update_conversation(conv)  # 방금 만든 문서라 다른 요청과 부딪히지 않는다
    ask, choices = conversation.opening(walk.topic_id)
    return TalkStart(conversation_id=conv["id"], ask=named(ask, character), choices=choices)


CONFLICT = "다른 요청이 먼저 이 대화를 이어 갔어요."


@router.post("/conversations/{conversation_id}/turn", response_model=TalkTurnOut)
def talk_turn(body: TalkTurnIn, conv: dict = Depends(open_conversation), store: Store = Depends(get_store)):
    if conv["ended_by"]:
        raise HTTPException(409, "이미 끝난 대화예요.")
    if body.choice_index is None and not body.text:
        raise HTTPException(422, "보기 번호나 문장이 필요해요.")

    # 비용 제한: 모델을 부를 때마다 아이·날짜별 카운터를 한 번에 확인하고 늘린다 (동시 요청에도 넘지 않음)
    day = str(today_kst())
    reserve = lambda: store.reserve_generation(conv["child_id"], day, prompts.DAILY_GENERATION_LIMIT)  # noqa: E731
    result = conversation.take_turn(conv, body.choice_index, body.text, body.input_mode, day=day, reserve=reserve)
    if result.get("fallback"):
        # 그림으로 돌아간 턴: 문장 없이 resolved_by만 남긴다 (리포트의 '그림으로 돌아간 수')
        conv["turns"].append({"said": None, "reply": None, "input_mode": body.input_mode, "resolved_by": "fallback"})
        if not store.update_conversation(conv):
            raise HTTPException(409, CONFLICT)
        return TalkTurnOut(reply="그림으로 골라 볼까요?", finished=False, choices=result["choices"],
                           fallback_to_picture=True)

    # 마스킹된 문장만 저장
    turn = {"said": result["said"], "reply": result["reply"], "input_mode": body.input_mode,
            "resolved_by": result["resolved_by"]}
    if result.get("prompt_version"):  # 모델로 정한 턴이 있으면 어느 프롬프트였는지 대화 문서에 남긴다 (평가용)
        conv["prompt_version"] = result["prompt_version"]
    conv["turns"].append(turn)
    conv["turn"] += 1
    finished = conv["turn"] >= conversation.MAX_TURNS
    if finished:
        conv["ended_by"] = "maxTurns"
    # 읽은 뒤 다른 요청이 먼저 저장했으면 이 턴은 버린다 (턴·호출 수가 덮어써지지 않게). 프론트는 실패로 보고 대본으로 이어 감
    if not store.update_conversation(conv):
        raise HTTPException(409, CONFLICT)
    if finished:
        return TalkTurnOut(reply=result["reply"], finished=True, expression=result.get("expression"))
    talk = tales()[conv["topic_id"]]["talk"]
    return TalkTurnOut(reply=result["reply"], finished=False, ask=named(talk["again"], conv.get("friend")),
                       choices=talk["extra"], expression=result.get("expression"))


@router.post("/conversations/{conversation_id}/end")
def end_talk(conv: dict = Depends(conversation_or_404), store: Store = Depends(get_store)):
    """끝난 산책이어도 받는다 (화면은 끝내기와 산책 완료를 기다리지 않고 함께 보낸다)."""
    for _ in range(3):  # 턴 저장과 부딪히면 다시 읽고 끝낸다
        conv["ended_by"] = conv["ended_by"] or "button"
        if store.update_conversation(conv):
            break
        conv = store.get_conversation(conv["id"]) or conv
    else:
        raise HTTPException(409, CONFLICT)
    return {"ended_by": conv["ended_by"], "turns": conv["turn"]}  # 친구가 답한 턴 수
