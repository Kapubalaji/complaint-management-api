import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.database import engine
from backend.models.complaint import Complaint
from backend.models.user import User
from backend.schemas import (
    AnalyticsResponse,
    MyWorkload,
    ResolutionStats,
    StaffWorkload,
    TrendPoint,
)
from backend.security import get_current_user
from backend.services.ai_service import (
    ALLOWED_CATEGORIES,
    ALLOWED_PRIORITIES,
    ALLOWED_SENTIMENTS,
)

router = APIRouter()

TREND_DAYS = 30
STATUS_ORDER = ["open", "in_progress", "resolved", "closed"]
RESOLVED_STATUSES = ("resolved", "closed")


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _norm_status(value) -> str:
    return str(value or "open").strip().lower().replace(" ", "_")


def _parse_export_date(value: str | None, name: str) -> date | None:
    if value is None:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"{name} must be a valid date in YYYY-MM-DD format.",
        )


def _start_of_day(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _bump(counter: dict, key, fallback: str) -> None:
    label = str(key).strip() if key is not None else ""
    if not label:
        label = fallback
    counter[label] = counter.get(label, 0) + 1


def _apply_role_scope(query, current_user: User):
    """Scope complaint rows by role.

    - admin: all organization complaints
    - staff: only complaints assigned to them
    - user: only their own complaints
    """
    if current_user.role == "admin":
        return query
    if current_user.role == "staff":
        return query.filter(Complaint.assigned_staff_id == current_user.id)
    return query.filter(Complaint.user_id == current_user.id)


@router.get("/reports/analytics", response_model=AnalyticsResponse)
def get_analytics(current_user: User = Depends(get_current_user)):
    """Role-scoped analytics computed from live database rows.

    - user: aggregates only the caller's own complaints.
    - staff: aggregates only complaints assigned to the caller.
    - admin: aggregates all complaints, plus org-wide workload breakdowns.
    """
    is_admin = current_user.role == "admin"
    is_staff = current_user.role in ("staff", "admin")

    with Session(engine) as session:
        rows = _apply_role_scope(session.query(Complaint), current_user).all()

        totals: dict[str, int] = {"total": len(rows)}
        for status_key in STATUS_ORDER:
            totals[status_key] = 0

        by_priority = {priority: 0 for priority in ALLOWED_PRIORITIES}
        by_category = {category: 0 for category in ALLOWED_CATEGORIES}
        by_sentiment = {sentiment: 0 for sentiment in ALLOWED_SENTIMENTS}

        resolution_hours: list[float] = []
        resolved_count = 0

        for row in rows:
            status_key = _norm_status(row.status)
            totals[status_key] = totals.get(status_key, 0) + 1

            _bump(by_priority, row.priority, "Medium")
            _bump(by_category, row.category, "General")
            _bump(by_sentiment, row.sentiment, "Unknown")

            resolved_at = _as_utc(row.resolved_at)
            if resolved_at is not None:
                resolved_count += 1
                created_at = _as_utc(row.created_at)
                if created_at is not None:
                    hours = (resolved_at - created_at).total_seconds() / 3600.0
                    resolution_hours.append(max(hours, 0.0))

        totals["unassigned"] = sum(1 for row in rows if row.assigned_staff_id is None)

        total_count = len(rows)
        avg_hours = (
            round(sum(resolution_hours) / len(resolution_hours), 1)
            if resolution_hours
            else None
        )
        resolution = ResolutionStats(
            resolved_count=resolved_count,
            total_count=total_count,
            resolution_rate=round(resolved_count / total_count, 4) if total_count else 0.0,
            avg_resolution_hours=avg_hours,
        )

        today = datetime.now(timezone.utc).date()
        window_days = [today - timedelta(days=offset) for offset in range(TREND_DAYS - 1, -1, -1)]
        created_by_day = {day: 0 for day in window_days}
        resolved_by_day = {day: 0 for day in window_days}

        for row in rows:
            created_at = _as_utc(row.created_at)
            if created_at and created_at.date() in created_by_day:
                created_by_day[created_at.date()] += 1
            resolved_at = _as_utc(row.resolved_at)
            if resolved_at and resolved_at.date() in resolved_by_day:
                resolved_by_day[resolved_at.date()] += 1

        trend = [
            TrendPoint(
                date=day.isoformat(),
                created=created_by_day[day],
                resolved=resolved_by_day[day],
            )
            for day in window_days
        ]

        my_workload = None
        staff_workload: list[StaffWorkload] = []

        if is_staff:
            mine = [row for row in rows if row.assigned_staff_id == current_user.id]
            my_workload = MyWorkload(
                active_count=sum(
                    1 for row in mine if _norm_status(row.status) in ("open", "in_progress")
                ),
                total_count=len(mine),
                resolved_count=sum(1 for row in mine if row.resolved_at is not None),
            )

        # Org-wide staff workload is admin-only (staff reports stay assignment-scoped).
        if is_admin:
            assigned_by_staff: dict[int, list] = {}
            for row in rows:
                if row.assigned_staff_id is not None:
                    assigned_by_staff.setdefault(row.assigned_staff_id, []).append(row)

            staff_users = (
                session.query(User).filter(User.role.in_(["staff", "admin"])).all()
            )
            for person in staff_users:
                assigned = assigned_by_staff.get(person.id, [])
                staff_workload.append(
                    StaffWorkload(
                        id=person.id,
                        username=person.username,
                        full_name=person.full_name or person.username,
                        active_count=sum(
                            1
                            for row in assigned
                            if _norm_status(row.status) in ("open", "in_progress")
                        ),
                        total_count=len(assigned),
                        resolved_count=sum(
                            1 for row in assigned if row.resolved_at is not None
                        ),
                    )
                )

        return AnalyticsResponse(
            scope=current_user.role,
            generated_at=datetime.now(timezone.utc),
            totals=totals,
            by_priority=by_priority,
            by_category=by_category,
            by_sentiment=by_sentiment,
            resolution=resolution,
            trend=trend,
            my_workload=my_workload,
            staff_workload=staff_workload,
        )


@router.get("/reports/export")
def export_complaints_csv(
    start_date: str | None = Query(
        None,
        description="Include complaints created on or after this date (YYYY-MM-DD).",
    ),
    end_date: str | None = Query(
        None,
        description="Include complaints created on or before this date (YYYY-MM-DD).",
    ),
    current_user: User = Depends(get_current_user),
):
    """Role-scoped CSV report of complaint records from the live database.

    - user: exports only the caller's own complaints.
    - staff: exports only complaints assigned to the caller.
    - admin: exports every complaint.
    - optional start_date/end_date (YYYY-MM-DD) filter by created_at, inclusive.
    """
    start = _parse_export_date(start_date, "start_date")
    end = _parse_export_date(end_date, "end_date")
    if start is not None and end is not None and start > end:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date.",
        )

    with Session(engine) as session:
        query = _apply_role_scope(session.query(Complaint), current_user)
        if start is not None:
            query = query.filter(Complaint.created_at >= _start_of_day(start))
        if end is not None:
            query = query.filter(
                Complaint.created_at < _start_of_day(end + timedelta(days=1))
            )
        rows = query.order_by(Complaint.created_at.desc()).all()

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "id",
                "title",
                "status",
                "category",
                "priority",
                "sentiment",
                "user_id",
                "assigned_staff_id",
                "created_at",
                "resolved_at",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row.id,
                    row.title,
                    _norm_status(row.status),
                    row.category or "",
                    row.priority or "",
                    row.sentiment or "",
                    row.user_id,
                    row.assigned_staff_id if row.assigned_staff_id is not None else "",
                    row.created_at.isoformat() if row.created_at else "",
                    row.resolved_at.isoformat() if row.resolved_at else "",
                ]
            )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=complaints-report-{stamp}.csv"
        },
    )
