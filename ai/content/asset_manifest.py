"""생성 자산 이력(manifest) 만들기·갱신: docs/ai/content/asset-manifest.json

frontend/public의 그림·소리 파일마다 한 항목. 저장소 문서에서 확인한 사실만 채우고, 모르는 칸은 null로 두고
unknown 목록에 적는다 (추정해서 채우지 않는다). 사람이 채운 칸(모델·프롬프트·생성일·검수)은 다시 실행해도 지우지 않는다.

    python ai/content/asset_manifest.py            # 새 파일 추가, 사라진 파일 표시
    python ai/content/asset_manifest.py --check    # 목록이 파일과 맞는지만 확인 (CI·테스트용)

항목 칸:
  file, kind, intendedEmotion, model{name, version}, prompt, promptRef, createdAt,
  review{result(approved·rejected·needsChange), reviewer, reviewedAt, note}, addedToRepo{commit, date}, sources, unknown
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "frontend" / "public"
OUT = ROOT / "docs" / "ai" / "content" / "asset-manifest.json"
FOLDERS = ("art", "audio")
EXTENSIONS = (".webp", ".png", ".jpg", ".mp3", ".wav")
EMOTIONS = ("joy", "sad", "surprise", "anger", "fear", "disgust", "neutral")
FILLABLE = ("model", "prompt", "promptRef", "createdAt")

# 저장소 문서에 적힌 사실 (출처를 sources에 남긴다)
KNOWN = [
    # PRD.md '감정 카드와 화면 설계': 11월 20일 카드 네 장은 ImageGen으로 제작 (남자아이 카드 4장)
    (re.compile(r"^art/cards/(joy|sad|surprise|anger)\.webp$"),
     {"model": {"name": "ImageGen", "version": None}, "createdAt": "2026-11-20",
      "sources": ["PRD.md '감정 카드와 화면 설계' (11월 20일 카드 네 장은 ImageGen으로 제작)"]}),
    # prompts/tale-backgrounds.md: 최종 4장의 프롬프트 (도구 이름·생성일은 적혀 있지 않음)
    (re.compile(r"^art/tale/(joy-yard|sad-shore|surprise-garden|anger-playground)\.webp$"),
     {"promptRef": "prompts/tale-backgrounds.md", "sources": ["prompts/tale-backgrounds.md"]}),
]


def kind_of(path: str) -> str:
    parts = path.split("/")
    if parts[0] == "audio":
        return "voice"
    return {"cards": "emotionCard", "practice": "practiceScene", "tale": "taleBackground", "backup": "backup",
            "studio": "friendStudio"}.get(parts[1] if len(parts) > 2 else "", "friendOrScene")


def intended_of(path: str) -> str | None:
    """파일 이름에 감정 id가 있으면 그 감정 (예: cards/girl-sad.webp, practice/joy-after.webp, audio/raon/sad-intro.mp3)."""
    name = Path(path).stem
    for e in EMOTIONS:
        if re.search(rf"(^|[-_]){e}([-_]|$)", name):
            return e
    return None


def git_added(path: Path) -> dict | None:
    try:
        out = subprocess.run(["git", "log", "--diff-filter=A", "--format=%h %as", "--", str(path)], cwd=ROOT,
                             capture_output=True, text=True, timeout=10).stdout.strip().splitlines()
    except Exception:
        return None
    if not out:
        return None
    commit, date = out[-1].split()
    return {"commit": commit, "date": date}


def files() -> list[str]:
    return sorted(str(p.relative_to(PUBLIC)) for folder in FOLDERS for p in (PUBLIC / folder).rglob("*")
                  if p.is_file() and p.suffix.lower() in EXTENSIONS)


def entry(path: str, old: dict | None) -> dict:
    kind = kind_of(path)
    # 표정·장면을 그린 그림만 '의도한 감정'. 음성은 그 감정 학습의 안내라 topic으로 따로 둔다.
    pictured = kind in ("emotionCard", "practiceScene", "taleBackground")
    item = {"file": path, "kind": kind, "intendedEmotion": intended_of(path) if pictured else None,
            **({"topic": intended_of(path)} if kind == "voice" else {}),
            "model": None, "prompt": None, "promptRef": None, "createdAt": None,
            "review": {"result": None, "reviewer": None, "reviewedAt": None, "note": None},
            "addedToRepo": git_added(PUBLIC / path), "sources": []}
    for pattern, facts in KNOWN:
        if pattern.match(path):
            item.update({k: v for k, v in facts.items()})
    if old:  # 사람이 채운 값은 지우지 않는다
        for key in (*FILLABLE, "review", "sources"):
            if old.get(key) not in (None, [], {"result": None, "reviewer": None, "reviewedAt": None, "note": None}):
                item[key] = old[key]
    item["unknown"] = [k for k in FILLABLE if item[k] is None and not (k == "prompt" and item["promptRef"])
                       and not (k == "promptRef" and item["prompt"])]
    if item["model"] and item["model"].get("version") is None:
        item["unknown"].append("model.version")
    if item["review"]["result"] is None:
        item["unknown"].append("review")
    return item


def build(old_doc: dict | None = None) -> dict:
    old = {a["file"]: a for a in (old_doc or {}).get("assets", [])}
    current = files()
    assets = [entry(p, old.get(p)) for p in current]
    removed = sorted(set(old) - set(current))
    return {
        "format": "asset-manifest-v1",
        "note": ("앱이 쓰는 생성 자산의 이력. 저장소 문서로 확인한 값만 채웠고, 모르는 칸은 null이며 unknown에 적었다. "
                 "새 자산은 생성할 때 모델·버전·프롬프트·생성일·의도한 감정을 적고, 검수 후 review를 채운다."),
        "assets": assets,
        "removed": removed,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args(argv)
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    if args.check:
        listed = [a["file"] for a in (old or {}).get("assets", [])]
        missing = sorted(set(files()) - set(listed))
        if missing:
            print("manifest에 없는 자산:", ", ".join(missing), file=sys.stderr)
            return 1
        return 0
    doc = build(old)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(doc['assets'])}개 자산, 빠진 파일 {len(doc['removed'])}개 → {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
