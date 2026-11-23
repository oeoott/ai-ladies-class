"""학습 2 기록: AI 담당 채점 결과 칸(선택)을 받고, 영상·얼굴 특징·blendshape 값은 받지 않는다."""
import pytest

from app.store import MemoryStore

from .test_conversation_ai import client
from .test_walk_flow import start


def record(c, body):
    wid = start(c)["id"]
    return c.post(f"/lessons/mirror/walks/{wid}/record", json=body)


def test_frontend_record_stays_the_same():
    store = MemoryStore()
    c = client(store)
    assert record(c, {"mode": "touch", "score": None, "skipped": False}).status_code == 200
    [row] = [a for a in store.attempts if a["kind"] == "mirror"]
    assert (row["mode"], row["score"], row["stars"], row["end_reason"]) == ("touch", None, None, None)


def test_scoring_fields_are_saved():
    store = MemoryStore()
    c = client(store)
    body = {"mode": "camera", "score": 72.5, "score_version": "face-v1.0", "stars": 2, "tracked_sec": 12.4,
            "attempts": 3, "end_reason": "locked"}
    assert record(c, body).status_code == 200
    [row] = [a for a in store.attempts if a["kind"] == "mirror"]
    assert {k: row[k] for k in body} == body


@pytest.mark.parametrize("end_reason", ["locked", "skipped", "cameraDenied", "exit"])
def test_each_end_reason(end_reason):
    assert record(client(), {"mode": "touch", "end_reason": end_reason}).status_code == 200


@pytest.mark.parametrize("extra", [
    {"blendshapes": {"mouthSmileLeft": 0.8}},  # 얼굴 특징 값
    {"landmarks": [[0.1, 0.2, 0.3]]},
    {"frame": "data:image/jpeg;base64,AAAA"},  # 영상
    {"stars": 4}, {"stars": -1}, {"tracked_sec": -1}, {"attempts": -1},
    {"end_reason": "tired"}, {"score_version": "v 1"}, {"score": 101},
])
def test_face_data_and_out_of_range_values_are_refused(extra):
    assert record(client(), {"mode": "camera", **extra}).status_code == 422
