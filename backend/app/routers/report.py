"""레벨 테스트 저장과 보호자 리포트 (백엔드 1)."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import check_child, child_access, require_guardian, today_kst
from ..schemas import MonthlyReport, PlacementIn, PlacementOut, Report
from ..services.report import build_monthly, build_report
from ..store import Store, get_store

router = APIRouter(prefix="/children/{child_id}", tags=["레벨 테스트·리포트"])

DEFAULT_DAYS = 30  # 기간을 비우면 오늘까지 30일
MAX_DAYS = 366


@router.post("/placement", response_model=PlacementOut, status_code=201)
def save_placement(body: PlacementIn, child_id: str = Depends(child_access), store: Store = Depends(get_store)):
    """화면이 정한 level과 문항별 답을 저장한다. 토큰이 없으면 기기 child_id로 저장한다."""
    return store.add_placement(child_id, [a.model_dump() for a in body.answers], body.level)


@router.get("/placement", response_model=PlacementOut)
def get_placement(child_id: str = Depends(child_access), store: Store = Depends(get_store)):
    found = store.latest_placement(child_id)
    if found is None:
        raise HTTPException(404, "레벨 테스트 기록이 없어요.")
    return found


@router.get("/report", response_model=Report)
def report(child_id: str, start: date | None = Query(None, alias="from"), end: date | None = Query(None, alias="to"),
           guardian: dict = Depends(require_guardian), store: Store = Depends(get_store)):
    """보호자 토큰이 있어야만 본다. 기간은 산책 날짜 기준이며 from·to를 포함한다."""
    check_child(child_id, guardian, store)
    end = end or today_kst()
    start = start or end - timedelta(days=DEFAULT_DAYS - 1)
    if start > end or (end - start).days >= MAX_DAYS:
        raise HTTPException(422, f"기간은 시작일이 종료일보다 앞서고 {MAX_DAYS}일 이내여야 해요.")
    return build_report(store, child_id, start, end)


MAX_MONTHS = 24


@router.get("/report/monthly", response_model=MonthlyReport)
def monthly(child_id: str, to: str | None = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
            months: int = Query(6, ge=1, le=MAX_MONTHS),
            guardian: dict = Depends(require_guardian), store: Store = Depends(get_store)):
    """최근 months개월(마지막이 to 달, 기본 이번 달)의 월별 산책 수. 토큰·소유 확인은 리포트와 같다."""
    check_child(child_id, guardian, store)
    if to:
        year, month = int(to[:4]), int(to[5:])
    else:
        today = today_kst()
        year, month = today.year, today.month
    return build_monthly(store, child_id, year, month, months)
