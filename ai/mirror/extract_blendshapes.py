"""표정 거울 기준 사진 → MediaPipe blendshape JSON.

앱(frontend/src/facePreview.js)과 같은 모델 파일(frontend/public/models/face_landmarker.task)과
같은 설정(얼굴 2개까지, blendshape 출력)을 쓴다. 결과는 frontend/scripts/mirror-baseline.mjs의 입력이다.

사진 이름: {사람}_{감정}.{png|jpg|jpeg|webp}   예) p03_joy.png, p03_rest.png
  감정: joy sad surprise anger fear disgust neutral, 그리고 무표정 rest (모든 표정을 rest와 비교한다)
  사람 id에는 밑줄(_)을 쓰지 않는다. 가상 성인 얼굴 사진만 넣는다 (아이 사진·삽화 금지).

    pip install mediapipe pillow numpy      # 앱의 @mediapipe/tasks-vision 0.10.17과 가까운 버전 권장
    python ai/mirror/extract_blendshapes.py 사진폴더 --out docs/ai/mirror/blendshapes.json

사진 자체는 저장소에 넣지 않는다. 결과 JSON에는 파일 이름과 blendshape 숫자만 있다.
"""
import argparse
import json
import sys
from pathlib import Path

EMOTIONS = ("joy", "sad", "surprise", "anger", "fear", "disgust", "neutral", "rest")
EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "frontend" / "public" / "models" / "face_landmarker.task"
NUM_FACES = 2  # 앱과 같다. 두 얼굴이 잡힌 사진은 기준에서 뺀다


def parse_name(path: Path) -> tuple[str, str] | None:
    """'p03_joy.png' → ('p03', 'joy'). 규칙에 맞지 않으면 None."""
    if path.suffix.lower() not in EXTENSIONS:
        return None
    parts = path.stem.split("_")
    if len(parts) != 2 or not parts[0] or parts[1] not in EMOTIONS:
        return None
    return parts[0], parts[1]


def to_record(file: str, person: str, emotion: str, result=None, error: str | None = None) -> dict:
    """MediaPipe FaceLandmarkerResult(또는 같은 모양의 가짜)를 기록 한 줄로. 얼굴이 하나일 때만 blendshape를 넣는다."""
    if error is not None:
        return {"file": file, "person": person, "emotion": emotion, "faces": None, "blendshapes": None, "error": error}
    faces = len(result.face_landmarks)
    blendshapes = None
    if faces == 1 and result.face_blendshapes:
        blendshapes = {c.category_name: round(float(c.score), 5) for c in result.face_blendshapes[0]}
    reason = None if faces == 1 else ("noFace" if faces == 0 else "multiFace")
    return {"file": file, "person": person, "emotion": emotion, "faces": faces, "blendshapes": blendshapes,
            "error": reason}


def make_landmarker(model: Path = MODEL):
    from mediapipe.tasks.python import BaseOptions, vision  # 설치가 필요한 곳에서만 불러온다

    options = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model)), running_mode=vision.RunningMode.IMAGE,
        num_faces=NUM_FACES, output_face_blendshapes=True, output_facial_transformation_matrixes=False)
    return vision.FaceLandmarker.create_from_options(options)


def load_image(path: Path):
    import mediapipe as mp
    from PIL import Image
    import numpy as np

    with Image.open(path) as img:  # webp·투명 배경도 RGB로
        rgb = np.asarray(img.convert("RGB"))
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)


def extract(folder: Path, detect, load=load_image) -> dict:
    """detect(image) → FaceLandmarkerResult. 파일 오류·이름 오류도 기록에 남긴다 (빠진 사진을 알 수 있게)."""
    records, ignored = [], []
    for path in sorted(p for p in folder.iterdir() if p.is_file()):
        parsed = parse_name(path)
        if parsed is None:
            ignored.append(path.name)
            continue
        person, emotion = parsed
        try:
            result = detect(load(path))
        except Exception as error:  # 깨진 파일 등
            records.append(to_record(path.name, person, emotion, error=f"file:{type(error).__name__}"))
            continue
        records.append(to_record(path.name, person, emotion, result))
    people = sorted({r["person"] for r in records})
    missing = [f"{p}_{e}" for p in people for e in EMOTIONS
               if not any(r["person"] == p and r["emotion"] == e and r["blendshapes"] for r in records)]
    return {"model": MODEL.name, "num_faces": NUM_FACES, "records": records, "ignored": ignored, "missing": missing}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="표정 거울 기준 사진 → blendshape JSON")
    ap.add_argument("folder", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--model", type=Path, default=MODEL)
    args = ap.parse_args(argv)
    landmarker = make_landmarker(args.model)
    try:
        doc = extract(args.folder, landmarker.detect)
    finally:
        landmarker.close()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ok = sum(1 for r in doc["records"] if r["blendshapes"])
    print(f"사진 {len(doc['records'])}장, 쓸 수 있는 사진 {ok}장, 이름 규칙 밖 {len(doc['ignored'])}개, "
          f"빠진 사진 {len(doc['missing'])}개", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
