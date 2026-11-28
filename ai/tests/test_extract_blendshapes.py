"""ai/mirror/extract_blendshapes.py 검사 (MediaPipe 없이: 가짜 결과 객체)."""
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mirror"))
import extract_blendshapes as ex  # noqa: E402


def result(faces: int, smile: float = 0.5):
    shapes = [[NS(category_name="mouthSmileLeft", score=smile), NS(category_name="_neutral", score=0.1)]] * faces
    return NS(face_landmarks=[[0]] * faces, face_blendshapes=shapes)


@pytest.mark.parametrize("name, expected", [
    ("p03_joy.png", ("p03", "joy")), ("team1_rest.JPG", ("team1", "rest")), ("p1_neutral.webp", ("p1", "neutral")),
    ("p03_happy.png", None), ("p03_joy_2.png", None), ("_joy.png", None), ("p03_joy.gif", None),
])
def test_parse_name(name, expected):
    assert ex.parse_name(Path(name)) == expected


def test_one_face_keeps_blendshapes_others_are_marked():
    assert ex.to_record("a", "p1", "joy", result(1))["blendshapes"] == {"mouthSmileLeft": 0.5, "_neutral": 0.1}
    assert ex.to_record("a", "p1", "joy", result(0)) | {} == {
        "file": "a", "person": "p1", "emotion": "joy", "faces": 0, "blendshapes": None, "error": "noFace"}
    assert ex.to_record("a", "p1", "joy", result(2))["error"] == "multiFace"


def test_extract_records_errors_ignored_and_missing(tmp_path):
    for name in ("p1_rest.png", "p1_joy.png", "p1_sad.png", "notes.txt", "p1_smile.png"):
        (tmp_path / name).write_bytes(b"x")

    def load(path):
        if path.name == "p1_sad.png":
            raise OSError("broken")
        return path.name

    doc = ex.extract(tmp_path, detect=lambda image: result(1 if image != "p1_joy.png" else 2), load=load)
    by = {r["file"]: r for r in doc["records"]}
    assert by["p1_rest.png"]["blendshapes"] and by["p1_joy.png"]["error"] == "multiFace"
    assert by["p1_sad.png"]["error"] == "file:OSError"
    assert sorted(doc["ignored"]) == ["notes.txt", "p1_smile.png"]
    assert "p1_joy" in doc["missing"] and "p1_fear" in doc["missing"] and "p1_rest" not in doc["missing"]
    assert doc["num_faces"] == 2 and doc["model"] == "face_landmarker.task"


def test_same_model_file_as_the_app():
    assert ex.MODEL.is_file()
    assert "face_landmarker.task" in (ex.ROOT / "frontend/src/facePreview.js").read_text()
