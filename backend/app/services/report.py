"""보호자 리포트 집계 (백엔드 1). 숫자만 만든다. 대화 문장·선택한 낱말은 넣지 않는다."""
from datetime import date

from ..content import emotions, topic_ids
from ..schemas import EmotionStat, MirrorStat, MonthlyReport, MonthWalks, Report, StoryStat, WalkStat
from ..store import Store


def _ratio(part: int, whole: int) -> float | None:
    return round(part / whole, 2) if whole else None


def build_report(store: Store, child_id: str, start: date, end: date) -> Report:
    """기간은 산책 날짜(walk.day, 한국 날짜) 기준이며 start와 end를 포함한다."""
    walks = {w.id: w for w in store.list_walks(child_id) if start <= w.day <= end}
    attempts = [a for a in store.list_attempts(child_id) if a.get("walk_id") in walks]
    conversations = [c for c in store.list_conversations(child_id) if c["walk_id"] in walks]

    emotion = []
    for topic_id in topic_ids():
        rows = [a for a in attempts if a["kind"] == "emotion" and walks[a["walk_id"]].topic_id == topic_id]
        correct = sum(1 for a in rows if a.get("correct"))
        emotion.append(EmotionStat(topic_id=topic_id, label=emotions()[topic_id]["label"], answers=len(rows),
                                   correct=correct, accuracy=_ratio(correct, len(rows)),
                                   hint_used=sum(1 for a in rows if a.get("used_hint"))))

    mirror = [a for a in attempts if a["kind"] == "mirror"]
    camera = sum(1 for a in mirror if a.get("mode") == "camera")
    touch = sum(1 for a in mirror if a.get("mode") == "touch")

    turns = [t for c in conversations for t in c["turns"]]
    voice = sum(1 for t in turns if t.get("input_mode") == "voice")

    return Report(
        child_id=child_id, from_day=start, to_day=end,
        walks=WalkStat(completed=sum(1 for w in walks.values() if w.status == "completed" and not w.review),
                       reviews=sum(1 for w in walks.values() if w.status == "completed" and w.review)),
        emotion=emotion,
        mirror=MirrorStat(records=len(mirror), camera=camera, touch=touch,
                          camera_ratio=_ratio(camera, len(mirror)), touch_ratio=_ratio(touch, len(mirror))),
        story=StoryStat(conversations=len(conversations), turns=len(turns), voice_turns=voice,
                        voice_ratio=_ratio(voice, len(turns)),
                        fallback_to_picture=sum(c.get("fallbacks", 0) for c in conversations),
                        blocked=sum(1 for c in conversations for s in c.get("safety", []) if s.get("blocked"))),
        sticker_days=[d for d in store.sticker_days(child_id) if str(start) <= d <= str(end)],
    )


def build_monthly(store: Store, child_id: str, year: int, month: int, months: int) -> MonthlyReport:
    """to 달까지 최근 months개월의 산책 수. 산책 수는 스티커 받은 날 수(달력과 같은 기준)."""
    keys = []
    for back in range(months - 1, -1, -1):
        y, m = divmod(year * 12 + (month - 1) - back, 12)
        keys.append(f"{y:04d}-{m + 1:02d}")
    counts = {k: 0 for k in keys}
    for day in set(store.sticker_days(child_id)):
        if day[:7] in counts:
            counts[day[:7]] += 1
    return MonthlyReport(child_id=child_id, months=[MonthWalks(month=k, walks=counts[k]) for k in keys])
