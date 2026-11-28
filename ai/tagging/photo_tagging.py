"""학습 1 사진 태깅 (Colab 노트북 ai/colab/photo_tagging.ipynb가 이 파일을 그대로 쓴다).

사진 → 얼굴 1개 검출·자르기 → RGB → trpakov/vit-face-expression → 공통 7감정 점수 → 검토 필요 판정 → JSON.

- 대상: 생성한 가상 성인 얼굴 사진만. 삽화·캐릭터·상황 그림, 실제 아동 사진은 넣지 않는다.
- 모델 점수는 추천일 뿐이다. 사람이 검수한 라벨(confirmedTag)과 구분해 두고, 퀴즈 난이도로 바로 쓰지 않는다.
- 이 모델은 FER2013(흑백 저해상도 얼굴, 주로 성인)으로 학습됐다. 성인 사진에서 나온 결과를 아동 대상 성능으로 보지 않는다.

라벨(모델 config.json의 id2label, 2026-11-28 확인): angry, disgust, fear, happy, neutral, sad, surprise
공통 7감정 코드: anger, disgust, fear, joy, neutral, sad, surprise (happy → joy, angry → anger)
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

MODEL_ID = "trpakov/vit-face-expression"
EMOTIONS = ("anger", "disgust", "fear", "joy", "neutral", "sad", "surprise")
LABELS_KO = {"anger": "화남", "disgust": "혐오", "fear": "두려움", "joy": "기쁨", "neutral": "무표정",
             "sad": "슬픔", "surprise": "놀람"}
# 모델 라벨 → 공통 코드. 모델이 이 밖의 라벨을 내면 오류로 멈춘다 (check_model_labels).
MODEL_LABELS = {"angry": "anger", "disgust": "disgust", "fear": "fear", "happy": "joy", "neutral": "neutral",
                "sad": "sad", "surprise": "surprise"}
# 파일 이름·메타데이터의 의도 감정으로 받는 다른 이름 (이전 표기 포함)
ALIASES = {"happy": "joy", "angry": "anger", "calm": "neutral", "평온": "neutral", "싫음": "disgust",
           **{v: k for k, v in LABELS_KO.items()}, **{k: k for k in EMOTIONS}}
EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
FORMAT = "photo-tags-v1"


@dataclass
class ReviewConfig:
    """검토 필요 기준. 바꾸면 결과 JSON의 config에 남는다."""
    min_top_score: float = 0.5  # 1위 점수가 이보다 낮으면 검토
    require_intended: bool = True  # 의도 감정을 알 수 없으면 검토
    face_margin: float = 0.2  # 자를 때 얼굴 상자 바깥 여백 (상자 크기 대비)
    min_face_px: int = 48  # 이보다 작은 얼굴은 무시


def check_model_labels(id2label: dict) -> dict:
    """모델 config의 id2label이 예상한 7개 라벨인지 확인하고 {모델 라벨: 공통 코드}를 돌려준다."""
    labels = {str(v).lower() for v in id2label.values()}
    if labels != set(MODEL_LABELS):
        raise ValueError(f"모델 라벨이 예상과 달라요: {sorted(labels)} (예상 {sorted(MODEL_LABELS)})")
    return {label: MODEL_LABELS[label] for label in sorted(labels)}


def to_scores(predictions: list[dict]) -> dict:
    """pipeline 출력 [{label, score}] → 공통 7감정 점수 (합이 1이 되게 다시 나눔, 소수 4자리)."""
    scores = {e: 0.0 for e in EMOTIONS}
    for p in predictions:
        label = str(p["label"]).lower()
        if label not in MODEL_LABELS:
            raise ValueError(f"모르는 라벨: {label}")
        scores[MODEL_LABELS[label]] += float(p["score"])
    total = sum(scores.values())
    if total <= 0:
        raise ValueError("점수가 모두 0이에요")
    return {e: round(v / total, 4) for e, v in scores.items()}


def intended_emotion(file_name: str, metadata: dict | None = None) -> tuple[str | None, str | None]:
    """생성할 때 의도한 감정과 그 출처. 메타데이터 intendedEmotion이 먼저, 없으면 파일 이름(person03_sad.png)."""
    if metadata and metadata.get("intendedEmotion"):
        code = ALIASES.get(str(metadata["intendedEmotion"]).strip().lower()) or ALIASES.get(
            str(metadata["intendedEmotion"]).strip())
        return (code, "metadata") if code else (None, None)
    stem = Path(file_name).stem.lower()
    for part in reversed(re.split(r"[_\-\s.]+", stem)):
        if part in ALIASES:
            return ALIASES[part], "filename"
    return None, None


def crop_box(box: tuple[int, int, int, int], width: int, height: int, margin: float) -> tuple[int, int, int, int]:
    """(x, y, w, h) 얼굴 상자에 여백을 더하고 사진 안으로 자른 (left, top, right, bottom)."""
    x, y, w, h = box
    dx, dy = int(w * margin), int(h * margin)
    return max(0, x - dx), max(0, y - dy), min(width, x + w + dx), min(height, y + h + dy)


def review_reasons(record: dict, config: ReviewConfig) -> list[str]:
    """검토 필요 사유. 비어 있으면 검토 필요 없음(그래도 사람 검수 전에는 확정이 아니다)."""
    if record.get("error"):
        return [record["error"]]
    reasons = []
    scores = record["aiScores"]
    top = record["aiTag"]
    if scores[top] < config.min_top_score:
        reasons.append("lowConfidence")
    if record["intended"] is None:
        if config.require_intended:
            reasons.append("noIntended")
    elif record["intended"] != top:
        reasons.append("mismatch")
    return reasons


def empty_review() -> dict:
    """사람 검수 칸. 노트북의 검수 단계에서 채운다. 모델 추천(aiTag)과 따로 둔다."""
    return {"confirmedTag": None, "confirmedBy": None, "confirmedAt": None, "reviewNote": None}


def tag_image(file_name: str, image, detect, classify, config: ReviewConfig, metadata: dict | None = None) -> dict:
    """사진 한 장. image: RGB PIL.Image(또는 같은 모양의 가짜), detect(image) → [(x, y, w, h)...],
    classify(face) → [{label, score}]. 실패는 error 칸에 사유 코드로 남긴다."""
    intended, source = intended_emotion(file_name, metadata)
    record = {"file": file_name, "intended": intended, "intendedSource": source, "faces": None, "faceBox": None,
              "aiTag": None, "aiScores": None, "error": None, **empty_review()}
    try:
        boxes = [b for b in detect(image) if min(b[2], b[3]) >= config.min_face_px]
    except Exception as error:
        record["error"] = "detectError"
        record["errorDetail"] = type(error).__name__
        boxes = None
    if boxes is not None:
        record["faces"] = len(boxes)
        if not boxes:
            record["error"] = "noFace"
        elif len(boxes) > 1:
            record["error"] = "multiFace"
        else:
            box = crop_box(tuple(int(v) for v in boxes[0]), image.width, image.height, config.face_margin)
            record["faceBox"] = list(box)
            try:
                scores = to_scores(classify(image.crop(box).convert("RGB")))
                record["aiScores"] = scores
                record["aiTag"] = max(EMOTIONS, key=lambda e: scores[e])
            except Exception as error:
                record["error"] = "inferenceError"
                record["errorDetail"] = type(error).__name__
    record["reviewReasons"] = review_reasons(record, config)
    record["aiNeedsReview"] = bool(record["reviewReasons"])
    return record


def load_rgb(path: Path):
    from PIL import Image

    with Image.open(path) as img:
        return img.convert("RGB")


def tag_folder(folder: Path, detect, classify, config: ReviewConfig | None = None, load=load_rgb,
               metadata: dict | None = None) -> list[dict]:
    """폴더의 사진 전부. metadata: {파일 이름: {"intendedEmotion": ...}} (선택). 깨진 파일은 fileError."""
    config = config or ReviewConfig()
    records = []
    for path in sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in EXTENSIONS):
        meta = (metadata or {}).get(path.name)
        try:
            image = load(path)
        except Exception as error:
            intended, source = intended_emotion(path.name, meta)
            record = {"file": path.name, "intended": intended, "intendedSource": source, "faces": None,
                      "faceBox": None, "aiTag": None, "aiScores": None, "error": "fileError",
                      "errorDetail": type(error).__name__, **empty_review()}
            record["reviewReasons"] = ["fileError"]
            record["aiNeedsReview"] = True
            records.append(record)
            continue
        records.append(tag_image(path.name, image, detect, classify, config, meta))
    return records


def confirm(record: dict, tag: str, reviewer: str, note: str | None = None, at: str | None = None) -> dict:
    """사람 검수 결과를 기록한다. tag는 공통 7감정 코드 또는 'reject'(쓰지 않음)."""
    if tag not in EMOTIONS and tag != "reject":
        raise ValueError(f"검수 라벨은 7감정 코드 또는 reject: {tag}")
    if not reviewer:
        raise ValueError("검수자 이름이 필요해요")
    return {**record, "confirmedTag": tag, "confirmedBy": reviewer,
            "confirmedAt": at or datetime.now(timezone.utc).isoformat(), "reviewNote": note}


def summarize(records: list[dict]) -> dict:
    n = len(records)
    reasons: dict[str, int] = {}
    for r in records:
        for reason in r["reviewReasons"]:
            reasons[reason] = reasons.get(reason, 0) + 1
    tagged = [r for r in records if r["aiTag"]]
    with_intended = [r for r in tagged if r["intended"]]
    agree = sum(r["aiTag"] == r["intended"] for r in with_intended)
    confirmed = [r for r in records if r["confirmedTag"]]
    return {
        "photos": n, "tagged": len(tagged), "needsReview": sum(r["aiNeedsReview"] for r in records),
        "reasons": reasons,
        # 모델 추천과 생성 의도의 일치율 (정확도가 아니다: 의도한 표정이 잘 나왔는지 사람이 확인해야 한다)
        "agreeWithIntended": {"agree": agree, "of": len(with_intended),
                              "rate": round(agree / len(with_intended), 3) if with_intended else None},
        "confirmed": len(confirmed),
        # 사람 검수 라벨 기준 모델 일치율 (검수가 끝난 사진만)
        "agreeWithConfirmed": {
            "agree": sum(r["aiTag"] == r["confirmedTag"] for r in confirmed if r["aiTag"]),
            "of": sum(1 for r in confirmed if r["aiTag"] and r["confirmedTag"] != "reject")},
    }


def build_document(records: list[dict], config: ReviewConfig, model_info: dict, created_at: str | None = None) -> dict:
    """결과 JSON. difficulty는 정하지 않는다 (모델 점수를 퀴즈 난이도로 바로 쓰지 않음)."""
    return {
        "format": FORMAT,
        "createdAt": created_at or datetime.now(timezone.utc).isoformat(),
        "model": model_info,
        "labelMap": MODEL_LABELS,
        "emotions": {e: LABELS_KO[e] for e in EMOTIONS},
        "config": asdict(config),
        "scope": "가상 성인 얼굴 사진의 태그 추천. 아동 대상 성능 검증이 아니다.",
        "difficultyPolicy": "모델 점수로 퀴즈 난이도를 정하지 않는다. 난이도는 팀·특수교사가 검수 후 따로 정한다.",
        "summary": summarize(records),
        "records": records,
    }


def save(doc: dict, path: Path) -> Path:
    path = Path(path)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return path


# ---------- Colab에서 실제로 쓰는 검출기·분류기 (설치가 필요해 함수 안에서 불러온다) ----------
def opencv_detector(scale_factor: float = 1.1, min_neighbors: int = 5):
    """OpenCV Haar 정면 얼굴 검출기 (Colab에 기본 설치). 옆얼굴·가림에는 약하다 → 얼굴 없음은 검토로 남는다."""
    import cv2
    import numpy as np

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    def detect(image):
        gray = cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
        found = cascade.detectMultiScale(gray, scaleFactor=scale_factor, minNeighbors=min_neighbors)
        return [tuple(int(v) for v in b) for b in found]

    return detect


def hf_classifier(model_id: str = MODEL_ID, revision: str | None = None, device: int | None = None):
    """transformers 이미지 분류 파이프라인. 모델 라벨을 확인하고 (classify, model_info)를 돌려준다."""
    from transformers import pipeline

    pipe = pipeline("image-classification", model=model_id, revision=revision, device=device)
    label_map = check_model_labels(pipe.model.config.id2label)
    info = {"id": model_id, "revision": revision or getattr(pipe.model.config, "_commit_hash", None),
            "labels": sorted(label_map)}

    def classify(face):
        return pipe(face, top_k=len(MODEL_LABELS))

    return classify, info
