"""AI 비용 제한: 아이 한 명의 하루 Azure OpenAI 생성 호출 수 (prompts.DAILY_GENERATION_LIMIT)."""
from datetime import date

import pytest

from app.content import tales
from app.routers import story
from app.services import prompts
from app.services.report import build_report
from app.store import MemoryStore
from app.store_cosmos import CosmosStore

from .fake_cosmos import FakeDatabase
from .test_conversation_ai import FakeAzure, client, say, talk, use, with_keys  # noqa: F401 (fixture)
from .test_walk_flow import start

WALK_DAY = date(2026, 11, 21)  # test_walk_flow.start의 산책 날짜
HEARD = "비행기가 멀리 날아갔으면 좋겠어"  # 보기와 맞지 않는 말 → 생성


@pytest.fixture(params=["memory", "cosmos"])
def store(request):
    return MemoryStore() if request.param == "memory" else CosmosStore(FakeDatabase())


@pytest.fixture
def limit_two(monkeypatch, with_keys):  # noqa: F811
    monkeypatch.setattr(prompts, "DAILY_GENERATION_LIMIT", 2)
    monkeypatch.setattr(story, "today_kst", lambda: WALK_DAY)


@pytest.fixture
def fake(monkeypatch):
    return use(monkeypatch, FakeAzure(safety=(0,) * 40))


def openai_calls(fake):
    return fake.calls.count("openai")


def conversations(store, child_id="kid1"):
    return store.list_conversations(child_id)


def story_report(store, child_id="kid1"):
    return build_report(store, child_id, WALK_DAY, WALK_DAY).story


def test_daily_limit_is_30():
    assert prompts.DAILY_GENERATION_LIMIT == 30


def test_over_the_limit_skips_generation_and_falls_back(store, limit_two, fake):
    c = client(store)
    first = talk(c)
    assert not say(c, first, HEARD)["fallback_to_picture"]
    assert not say(c, first, HEARD)["fallback_to_picture"]  # 두 번째 턴으로 이 대화는 끝남
    assert openai_calls(fake) == 2

    out = say(c, talk(c), HEARD)
    assert out["fallback_to_picture"] and out["choices"] == tales()["joy"]["talk"]["choices"]
    assert openai_calls(fake) == 2  # _generate를 부르지 않음

    counted = {c["id"]: (c["generated"], c["limited"]) for c in conversations(store)}
    assert sorted(counted.values(), key=str) == [({"2026-11-21": 2}, 0), ({}, 1)]
    report = story_report(store)
    assert report.generation_limited == 1 and report.fallback_to_picture == 1


def test_choices_and_words_matching_a_choice_still_get_script_replies(store, limit_two, fake):
    c = client(store)
    first = talk(c)
    say(c, first, HEARD)
    say(c, first, HEARD)
    talk_lines = tales()["joy"]["talk"]

    tapped = c.post(f"/conversations/{talk(c)}/turn", json={"choice_index": 1}).json()
    assert tapped["reply"] == talk_lines["replies"][1] and not tapped["fallback_to_picture"]
    spoken = say(c, talk(c), talk_lines["choices"][0])
    assert spoken["reply"] == talk_lines["replies"][0] and not spoken["fallback_to_picture"]
    assert openai_calls(fake) == 2
    assert story_report(store).generation_limited == 0


def test_each_child_has_its_own_limit(store, limit_two, fake):
    c = client(store)
    first = talk(c)
    say(c, first, HEARD)
    say(c, first, HEARD)

    other = start(c, child_id="kid2")["id"]
    conv = c.post(f"/lessons/story/walks/{other}/talk").json()["conversation_id"]
    assert not say(c, conv, HEARD)["fallback_to_picture"]
    assert openai_calls(fake) == 3


def test_the_limit_starts_again_the_next_korean_day(store, limit_two, fake, monkeypatch):
    c = client(store)
    first = talk(c)
    say(c, first, HEARD)
    say(c, first, HEARD)
    assert say(c, talk(c), HEARD)["fallback_to_picture"]

    monkeypatch.setattr(story, "today_kst", lambda: date(2026, 11, 22))
    assert not say(c, talk(c), HEARD)["fallback_to_picture"]
    assert openai_calls(fake) == 3


def test_failed_generation_still_counts(store, limit_two, monkeypatch):
    fake = use(monkeypatch, FakeAzure(safety=(0,) * 40, reply=TimeoutError()))
    c = client(store)
    conv = talk(c)
    assert say(c, conv, HEARD)["fallback_to_picture"]  # 호출했지만 실패
    assert say(c, conv, HEARD)["fallback_to_picture"]
    assert say(c, conv, HEARD)["fallback_to_picture"]  # 제한: 부르지 않음
    assert openai_calls(fake) == 2
    report = story_report(store)
    assert report.generation_limited == 1 and report.fallback_to_picture == 3


def test_without_keys_nothing_is_counted(store, monkeypatch):
    monkeypatch.setattr(prompts, "DAILY_GENERATION_LIMIT", 0)
    c = client(store)
    out = say(c, talk(c), HEARD)
    assert out["fallback_to_picture"]
    [conv] = conversations(store)
    assert conv["generated"] == {} and conv["limited"] == 0


def test_conversations_saved_before_the_limit_still_count(store, limit_two, fake):
    """제한 전에 만든 대화 문서(generated·limited 칸 없음)도 읽을 수 있다."""
    c = client(store)
    conv_id = talk(c)
    old = store.get_conversation(conv_id)
    del old["generated"], old["limited"]
    store.save_conversation(old)
    assert not say(c, conv_id, HEARD)["fallback_to_picture"]
    assert story_report(store).generation_limited == 0
