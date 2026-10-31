from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import engine
from backend.models.user import User
from backend.models.complaint import Complaint
from backend.security import get_current_user
from backend.schemas import AIAnalysisResult, ComplaintResponse
from backend.services.ai_service import analyze_complaint_with_ai

router = APIRouter()

def get_staff_workload_list(session: Session) -> list[dict]:
    staff_users = session.query(User).filter(User.role.in_(["staff", "admin"])).all()
    staff_list = []
    for staff in staff_users:
        active_count = session.query(func.count(Complaint.id)).filter(
            Complaint.assigned_staff_id == staff.id,
            Complaint.status.in_(["open", "in_progress"])
        ).scalar() or 0
        staff_list.append({
            "id": staff.id,
            "username": staff.username,
            "full_name": staff.full_name or staff.username,
            "active_count": active_count
        })
    return staff_list

@router.post("/ai/preview", response_model=AIAnalysisResult)
def preview_ai_analysis(
    title: str,
    description: str,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        staff_list = get_staff_workload_list(session)
        analysis = analyze_complaint_with_ai(title, description, staff_list)
        return analysis

@router.post("/complaints/{complaint_id}/reanalyze", response_model=ComplaintResponse)
def reanalyze_complaint(
    complaint_id: int,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        from backend.routers.complaints import _load_scoped_complaint

        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        staff_list = get_staff_workload_list(session)
        analysis = analyze_complaint_with_ai(complaint.title, complaint.description, staff_list)

        complaint.category = analysis.category
        complaint.priority = analysis.priority
        complaint.sentiment = analysis.sentiment
        complaint.ai_summary = analysis.ai_summary
        complaint.suggested_staff_id = analysis.suggested_staff_id

        session.commit()
        session.refresh(complaint)
        return complaint
