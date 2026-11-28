"""학습 1 태깅 도구 검사. 실제 모델·사진 없이 가짜 검출기·분류기로 변환·검수 로직만 확인한다
(정확도 검증이 아니다)."""
import ast
import json
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tagging"))
import photo_tagging as pt  # noqa: E402

# 모델 config.json의 id2label (2026-11-28 확인한 값)
ID2LABEL = {"0": "angry", "1": "disgust", "2": "fear", "3": "happy", "4": "neutral", "5": "sad", "6": "surprise"}


class FakeImage:
    def __init__(self, width=400, height=300, name="img"):
        self.width, self.height, self.name, self.crops = width, height, name, []

    def crop(self, box):
        self.crops.append(box)
        return self

    def convert(self, mode):
        assert mode == "RGB"
        return self


def preds(top="happy", score=0.8):
    rest = (1 - score) / 6
    return [{"label": label, "score": score if label == top else rest} for label in ID2LABEL.values()]


def test_model_labels_map_to_the_seven_codes():
    assert pt.check_model_labels(ID2LABEL) == {"angry": "anger", "disgust": "disgust", "fear": "fear", "happy": "joy",
                                               "neutral": "neutral", "sad": "sad", "surprise": "surprise"}
    assert set(pt.MODEL_LABELS.values()) == set(pt.EMOTIONS)
    with pytest.raises(ValueError, match="예상과 달라요"):
        pt.check_model_labels({"0": "happy", "1": "contempt"})


def test_scores_cover_seven_codes_and_sum_to_one():
    scores = pt.to_scores(preds("angry", 0.7))
    assert list(scores) == list(pt.EMOTIONS) and scores["anger"] == 0.7
    assert abs(sum(scores.values()) - 1) < 1e-3
    with pytest.raises(ValueError):
        pt.to_scores([{"label": "contempt", "score": 1}])


@pytest.mark.parametrize("name, meta, expected", [
    ("person03_sad.png", None, ("sad", "filename")),
    ("p01-happy.webp", None, ("joy", "filename")),
    ("p01_angry.jpg", None, ("anger", "filename")),
    ("p02_평온.png", None, ("neutral", "filename")),  # 이전 표기
    ("p02_싫음.png", None, ("disgust", "filename")),  # 이전 표기
    ("p02_무표정.png", None, ("neutral", "filename")),
    ("img_0001.png", None, (None, None)),
    ("p01_joy.png", {"intendedEmotion": "fear"}, ("fear", "metadata")),  # 메타데이터 우선
    ("p01_joy.png", {"intendedEmotion": "두려움"}, ("fear", "metadata")),
])
def test_intended_emotion(name, meta, expected):
    assert pt.intended_emotion(name, meta) == expected


def test_crop_box_adds_margin_inside_the_photo():
    assert pt.crop_box((10, 10, 100, 100), 400, 300, 0.2) == (0, 0, 130, 130)
    assert pt.crop_box((300, 200, 100, 100), 400, 300, 0.2) == (280, 180, 400, 300)


CFG = pt.ReviewConfig()


def tag(name="p01_joy.png", boxes=((50, 40, 120, 120),), result=None, **kw):
    image = FakeImage()
    classify = (lambda face: result) if not callable(result) else result
    return pt.tag_image(name, image, lambda img: list(boxes), classify or (lambda f: preds()), CFG, **kw), image


def test_one_face_is_cropped_and_tagged_without_review_when_it_matches():
    record, image = tag(result=preds("happy", 0.8))
    assert image.crops == [(26, 16, 194, 184)]
    assert record["aiTag"] == "joy" and record["intended"] == "joy" and record["faces"] == 1
    assert record["reviewReasons"] == [] and record["aiNeedsReview"] is False
    assert record["confirmedTag"] is None  # 모델 추천은 확정이 아니다


@pytest.mark.parametrize("kwargs, reasons", [
    ({"boxes": ()}, ["noFace"]),
    ({"boxes": ((0, 0, 100, 100), (200, 0, 100, 100))}, ["multiFace"]),
    ({"boxes": ((0, 0, 20, 20),)}, ["noFace"]),  # 너무 작은 얼굴은 무시
    ({"result": preds("happy", 0.4)}, ["lowConfidence"]),
    ({"result": preds("sad", 0.9)}, ["mismatch"]),
    ({"result": preds("sad", 0.3)}, ["lowConfidence", "mismatch"]),
    ({"name": "img_0001.png"}, ["noIntended"]),
])
def test_review_reasons(kwargs, reasons):
    record, _ = tag(**{"result": preds(), **kwargs})
    assert record["reviewReasons"] == reasons and record["aiNeedsReview"] is True


def test_inference_and_detector_failures_are_recorded():
    def boom(face):
        raise RuntimeError("model")

    record, _ = tag(result=boom)
    assert record["error"] == "inferenceError" and record["reviewReasons"] == ["inferenceError"]
    assert record["aiTag"] is None and record["aiScores"] is None

    def bad_detect(img):
        raise ValueError("cv2")

    record = pt.tag_image("p01_joy.png", FakeImage(), bad_detect, lambda f: preds(), CFG)
    assert record["reviewReasons"] == ["detectError"]


def test_folder_with_a_broken_file(tmp_path):
    for name in ("p01_joy.png", "p01_sad.png", "notes.txt"):
        (tmp_path / name).write_bytes(b"x")

    def load(path):
        if path.name == "p01_sad.png":
            raise OSError("broken")
        return FakeImage()

    records = pt.tag_folder(tmp_path, lambda img: [(0, 0, 100, 100)], lambda f: preds(), load=load)
    assert [r["file"] for r in records] == ["p01_joy.png", "p01_sad.png"]
    assert records[1]["reviewReasons"] == ["fileError"] and records[1]["intended"] == "sad"


def test_human_review_is_kept_apart_from_the_model_tag():
    record, _ = tag(result=preds("sad", 0.9))
    done = pt.confirm(record, "joy", "검수자A", "의도대로 웃는 얼굴", at="2026-11-28T00:00:00+00:00")
    assert (done["aiTag"], done["intended"], done["confirmedTag"]) == ("sad", "joy", "joy")
    assert done["confirmedBy"] == "검수자A" and record["confirmedTag"] is None
    assert pt.confirm(record, "reject", "검수자A")["confirmedTag"] == "reject"
    with pytest.raises(ValueError):
        pt.confirm(record, "happy", "검수자A")
    with pytest.raises(ValueError):
        pt.confirm(record, "joy", "")


def test_document_has_no_difficulty_and_states_its_scope():
    a, _ = tag(result=preds("happy", 0.9))
    b, _ = tag(name="p02_sad.png", result=preds("happy", 0.9))
    b = pt.confirm(b, "sad", "검수자A")
    doc = pt.build_document([a, b], CFG, {"id": pt.MODEL_ID, "revision": None}, created_at="2026-11-28")
    assert doc["format"] == "photo-tags-v1" and doc["emotions"]["neutral"] == "무표정"
    assert doc["emotions"]["disgust"] == "혐오"
    assert "아동 대상 성능 검증이 아니다" in doc["scope"]
    assert "난이도" in doc["difficultyPolicy"]
    assert not any("difficulty" in r for r in doc["records"])
    s = doc["summary"]
    assert s["agreeWithIntended"] == {"agree": 1, "of": 2, "rate": 0.5}
    assert s["agreeWithConfirmed"] == {"agree": 0, "of": 1} and s["needsReview"] == 1
    json.dumps(doc, ensure_ascii=False)


def test_notebook_embeds_this_module_and_is_valid():
    nb = json.loads((ROOT / "colab" / "photo_tagging.ipynb").read_text(encoding="utf-8"))
    assert nb["nbformat"] == 4
    sources = ["".join(c["source"]) for c in nb["cells"]]
    module = (ROOT / "tagging" / "photo_tagging.py").read_text(encoding="utf-8")
    embedded = [s for s in sources if s.startswith("%%writefile photo_tagging.py\n")]
    assert embedded == ["%%writefile photo_tagging.py\n" + module.strip("\n")], \
        "모듈을 고쳤으면 python ai/colab/build_notebook.py를 다시 실행하세요"
    for cell, text in zip(nb["cells"], sources):
        if cell["cell_type"] == "code" and not text.startswith(("%%", "!")):
            ast.parse(text)  # 문법 오류 없음
    text = "\n".join(sources)
    for step in ("files.upload", "tag_folder", "pt.confirm", "files.download", "아동 대상 성능 검증이 아니다"):
        assert step in text, step
