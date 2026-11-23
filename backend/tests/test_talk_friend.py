"""대화 질문의 {친구} 자리: 숲 친구 id로 이름을 정한다. 친구의 대사에는 {친구}를 쓰지 않는다."""
import pytest

from app.content import friend_name, named, tales

from .test_conversation_ai import client
from .test_walk_flow import start


@pytest.mark.parametrize("character, name", [("lion", "라온이"), ("rabbit", "보리"), ("bear", "두리"), (None, "라온이")])
def test_friend_name_adds_i_after_a_final_consonant(character, name):
    assert friend_name(character) == name


def test_placeholder_is_only_in_the_questions():
    for topic_id, tale in tales().items():
        talk = tale["talk"]
        for line in talk["choices"] + talk["replies"] + talk["extra"] + talk["ends"]:
            assert "{친구}" not in line, (topic_id, line)


@pytest.mark.parametrize("body, name", [({"character": "rabbit"}, "보리"), ({}, "라온이"), (None, "라온이")])
def test_talk_start_names_the_friend(body, name):
    c = client()
    wid = start(c, topic_id="anger")["id"]
    out = c.post(f"/lessons/story/walks/{wid}/talk", **({"json": body} if body is not None else {})).json()
    assert out["ask"] == named(tales()["anger"]["talk"]["ask"], {"보리": "rabbit"}.get(name))
    assert name in out["ask"] and "{친구}" not in out["ask"]


def test_talk_start_takes_only_the_friend_id():
    c = client()
    wid = start(c)["id"]
    assert c.post(f"/lessons/story/walks/{wid}/talk", json={"character": "cat"}).status_code == 422
    assert c.post(f"/lessons/story/walks/{wid}/talk", json={"character": "lion", "nickname": "하늘"}).status_code == 422


def test_next_question_uses_the_same_friend():
    c = client()
    wid = start(c, topic_id="anger")["id"]
    conv = c.post(f"/lessons/story/walks/{wid}/talk", json={"character": "bear"}).json()["conversation_id"]
    out = c.post(f"/conversations/{conv}/turn", json={"choice_index": 0}).json()
    assert out["ask"] == named(tales()["anger"]["talk"]["again"], "bear")
    assert out["reply"] == tales()["anger"]["talk"]["replies"][0]
