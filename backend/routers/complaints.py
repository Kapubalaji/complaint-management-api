from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.models.user import User
from backend.database import engine
from backend.models.complaint import Complaint, ComplaintComment
from backend.security import get_current_user, require_role
from backend.schemas import (
    ComplaintCreate,
    ComplaintResponse,
    ComplaintUpdate,
    ComplaintPatch,
    ComplaintAssign,
    ComplaintStatusUpdate,
    CommentCreate,
    CommentResponse
)

router = APIRouter()


def _scoped_complaint_query(session: Session, current_user: User):
    """Complaints the caller is allowed to see.

    - admin: all complaints
    - staff: only complaints assigned to them
    - user: only their own complaints
    """
    query = session.query(Complaint)
    if current_user.role == "admin":
        return query
    if current_user.role == "staff":
        return query.filter(Complaint.assigned_staff_id == current_user.id)
    return query.filter(Complaint.user_id == current_user.id)


def _load_scoped_complaint(session: Session, complaint_id: int, current_user: User) -> Complaint:
    complaint = _scoped_complaint_query(session, current_user).filter(
        Complaint.id == complaint_id
    ).first()
    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint


@router.get(
    "/complaints",
    response_model=list[ComplaintResponse]
)
def get_complaints(current_user: User = Depends(get_current_user)):
    with Session(engine) as session:
        return (
            _scoped_complaint_query(session, current_user)
            .order_by(Complaint.created_at.desc())
            .all()
        )


@router.get(
    "/complaints/assigned-to-me",
    response_model=list[ComplaintResponse]
)
def get_complaints_assigned_to_me(
    current_user: User = Depends(require_role(["staff", "admin"]))
):
    with Session(engine) as session:
        complaints = session.query(Complaint).filter(
            Complaint.assigned_staff_id == current_user.id
        ).order_by(Complaint.created_at.desc()).all()
        return complaints


@router.get(
    "/complaints/unassigned",
    response_model=list[ComplaintResponse]
)
def get_unassigned_complaints(
    current_user: User = Depends(require_role(["admin"]))
):
    with Session(engine) as session:
        complaints = session.query(Complaint).filter(
            Complaint.assigned_staff_id.is_(None)
        ).order_by(Complaint.created_at.desc()).all()
        return complaints


@router.post(
    "/complaints",
    response_model=ComplaintResponse,
    status_code=201
)
def create_complaint(
    complaint_data: ComplaintCreate,
    current_user: User = Depends(require_role(["user", "admin"]))
):
    with Session(engine) as session:
        # Run AI triage automatically
        from backend.routers.ai import get_staff_workload_list
        from backend.services.ai_service import analyze_complaint_with_ai

        staff_list = get_staff_workload_list(session)
        ai_res = analyze_complaint_with_ai(complaint_data.title, complaint_data.description, staff_list)

        category = complaint_data.category or ai_res.category
        priority = complaint_data.priority or ai_res.priority

        complaint = Complaint(
            title=complaint_data.title,
            description=complaint_data.description,
            status=complaint_data.status or "open",
            category=category,
            priority=priority,
            sentiment=ai_res.sentiment,
            ai_summary=ai_res.ai_summary,
            suggested_staff_id=ai_res.suggested_staff_id,
            user_id=current_user.id
        )

        session.add(complaint)
        session.commit()
        session.refresh(complaint)

        return complaint


@router.get(
    "/complaints/{complaint_id}",
    response_model=ComplaintResponse
)
def get_complaint(
    complaint_id: int,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        return _load_scoped_complaint(session, complaint_id, current_user)


@router.put("/complaints/{complaint_id}", response_model=ComplaintResponse)
def update_complaint(
    complaint_id: int,
    complaint_data: ComplaintUpdate,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        if complaint_data.assigned_staff_id is not None and current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only admin can assign staff"
            )

        complaint.title = complaint_data.title
        complaint.description = complaint_data.description
        complaint.status = complaint_data.status
        if complaint_data.category:
            complaint.category = complaint_data.category
        if complaint_data.priority:
            complaint.priority = complaint_data.priority
        if current_user.role == "admin" and complaint_data.assigned_staff_id is not None:
            complaint.assigned_staff_id = complaint_data.assigned_staff_id

        if complaint.status.lower() in ["resolved", "closed"] and not complaint.resolved_at:
            complaint.resolved_at = datetime.now(timezone.utc)

        session.commit()
        session.refresh(complaint)

        return complaint


@router.patch(
    "/complaints/{complaint_id}",
    response_model=ComplaintResponse
)
def patch_complaint(
    complaint_id: int,
    complaint_data: ComplaintPatch,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        update_data = complaint_data.model_dump(exclude_unset=True)

        if "assigned_staff_id" in update_data and current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only admin can assign staff"
            )

        for field, value in update_data.items():
            setattr(complaint, field, value)

        if complaint.status and complaint.status.lower() in ["resolved", "closed"] and not complaint.resolved_at:
            complaint.resolved_at = datetime.now(timezone.utc)

        session.commit()
        session.refresh(complaint)

        return complaint


@router.patch("/complaints/{complaint_id}/status", response_model=ComplaintResponse)
def update_complaint_status(
    complaint_id: int,
    status_data: ComplaintStatusUpdate,
    current_user: User = Depends(require_role(["staff", "admin"]))
):
    valid_statuses = ["open", "in_progress", "resolved", "closed"]
    normalized_status = status_data.status.lower().replace(" ", "_")
    if normalized_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        complaint.status = status_data.status
        if normalized_status in ["resolved", "closed"] and not complaint.resolved_at:
            complaint.resolved_at = datetime.now(timezone.utc)

        # If resolution note is provided, log it as a comment
        if status_data.resolution_note:
            note_comment = ComplaintComment(
                complaint_id=complaint.id,
                user_id=current_user.id,
                comment=f"[Status update to '{status_data.status}'] {status_data.resolution_note}",
                is_internal=False
            )
            session.add(note_comment)

        session.commit()
        session.refresh(complaint)
        return complaint


@router.delete("/complaints/{complaint_id}")
def delete_complaint(complaint_id: int, current_user: User = Depends(get_current_user)):
    with Session(engine) as session:
        query = session.query(Complaint).filter(Complaint.id == complaint_id)

        # Only owner or admin can delete a complaint
        if current_user.role != "admin":
            query = query.filter(Complaint.user_id == current_user.id)

        complaint = query.first()

        if complaint is None:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found"
            )

        session.delete(complaint)
        session.commit()

    return {"message": "Complaint deleted successfully"}


@router.patch("/complaints/{complaint_id}/assign", response_model=ComplaintResponse)
def assign_staff_to_complaint(
    complaint_id: int,
    assign_data: ComplaintAssign,
    current_user: User = Depends(require_role(["admin"]))
):
    with Session(engine) as session:
        complaint = session.query(Complaint).filter(Complaint.id == complaint_id).first()
        if not complaint:
            raise HTTPException(status_code=404, detail="Complaint not found")

        staff = session.query(User).filter(User.id == assign_data.assigned_staff_id).first()
        if not staff or staff.role not in ["staff", "admin"]:
            raise HTTPException(status_code=400, detail="Target user is not a staff member or admin")

        complaint.assigned_staff_id = staff.id
        session.commit()
        session.refresh(complaint)
        return complaint


@router.get("/complaints/{complaint_id}/comments", response_model=list[CommentResponse])
def get_complaint_comments(
    complaint_id: int,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        query = session.query(ComplaintComment).filter(ComplaintComment.complaint_id == complaint.id)
        if current_user.role not in ["staff", "admin"]:
            query = query.filter(ComplaintComment.is_internal == False)

        return query.order_by(ComplaintComment.created_at.asc()).all()


@router.post("/complaints/{complaint_id}/comments", response_model=CommentResponse, status_code=201)
def add_complaint_comment(
    complaint_id: int,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        is_internal = comment_data.is_internal if current_user.role in ["staff", "admin"] else False

        comment = ComplaintComment(
            complaint_id=complaint.id,
            user_id=current_user.id,
            comment=comment_data.comment,
            is_internal=is_internal
        )

        session.add(comment)
        session.commit()
        session.refresh(comment)
        return comment
