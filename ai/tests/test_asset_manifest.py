"""생성 자산 manifest: 모든 자산이 있고, 저장소 문서로 확인한 값만 채워졌는지."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "content"))
import asset_manifest as am  # noqa: E402

DOC = json.loads(am.OUT.read_text(encoding="utf-8"))
FIELDS = {"file", "kind", "intendedEmotion", "model", "prompt", "promptRef", "createdAt", "review", "addedToRepo",
          "sources", "unknown"}


def test_every_asset_is_listed():
    assert am.main(["--check"]) == 0
    assert sorted(a["file"] for a in DOC["assets"]) == am.files()
    assert DOC["removed"] == []


def test_fields_and_no_guessing():
    for a in DOC["assets"]:
        assert FIELDS <= set(a), a["file"]
        filled = a["model"] or a["createdAt"] or a["prompt"] or a["promptRef"]
        assert bool(filled) == bool(a["sources"]), f"{a['file']}: 값에는 출처가 있어야 함"
        assert a["review"] == {"result": None, "reviewer": None, "reviewedAt": None, "note": None}  # 검수 기록 없음
        assert "review" in a["unknown"]
    cards = {a["file"]: a for a in DOC["assets"] if a["kind"] == "emotionCard"}
    assert cards["art/cards/joy.webp"]["model"] == {"name": "ImageGen", "version": None}
    assert cards["art/cards/girl-joy.webp"]["model"] is None  # 여자아이 카드의 출처는 문서에 없다
    assert cards["art/cards/sad.webp"]["intendedEmotion"] == "sad"
    tale = next(a for a in DOC["assets"] if a["file"] == "art/tale/joy-yard.webp")
    assert tale["promptRef"] == "prompts/tale-backgrounds.md" and tale["model"] is None
    voice = next(a for a in DOC["assets"] if a["kind"] == "voice" and a["file"].endswith("joy-intro.mp3"))
    assert voice["intendedEmotion"] is None and voice["topic"] == "joy"


def test_values_filled_by_people_are_kept():
    old = {"assets": [{"file": "art/cards/girl-joy.webp", "model": {"name": "X", "version": "1"},
                       "prompt": "웃는 여자아이", "createdAt": "2026-11-21",
                       "review": {"result": "approved", "reviewer": "검수자", "reviewedAt": "2026-11-29", "note": None},
                       "sources": ["팀 기록"]}]}
    item = next(a for a in am.build(old)["assets"] if a["file"] == "art/cards/girl-joy.webp")
    assert item["model"]["name"] == "X" and item["review"]["result"] == "approved"
    assert item["unknown"] == []
