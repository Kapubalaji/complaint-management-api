import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from backend.models.user import User
from backend.database import engine
from backend.models.complaint import Complaint, ComplaintComment, ComplaintImage
from backend.security import get_current_user, require_role
from backend.schemas import (
    ComplaintCreate,
    ComplaintResponse,
    ComplaintUpdate,
    ComplaintPatch,
    ComplaintAssign,
    ComplaintStatusUpdate,
    CommentCreate,
    CommentResponse,
    ComplaintImageResponse,
)
from backend.services.cloudinary_service import (
    validate_image_file,
    upload_image_to_cloudinary,
    delete_image_from_cloudinary,
    MAX_IMAGES_PER_COMPLAINT,
)

logger = logging.getLogger(__name__)
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

        # Collect Cloudinary public_ids for all attached images before deletion
        public_ids_to_delete = [
            img.public_id for img in complaint.images if img.public_id
        ]

        try:
            session.delete(complaint)
            session.commit()
        except Exception as e:
            session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error deleting complaint: {str(e)}"
            )

        # Safely delete Cloudinary assets after DB commit succeeds
        for pid in public_ids_to_delete:
            try:
                delete_image_from_cloudinary(pid)
            except Exception as e:
                logger.error("Failed to delete Cloudinary asset %s on complaint deletion: %s", pid, e)

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


@router.post(
    "/complaints/{complaint_id}/images",
    response_model=list[ComplaintImageResponse],
    status_code=201
)
async def upload_complaint_images(
    complaint_id: int,
    files: list[UploadFile] = File(...),
    image_type: str = Form("issue"),
    current_user: User = Depends(get_current_user)
):
    valid_types = ["issue", "repair"]
    normalized_type = (image_type or "issue").lower().strip()
    if normalized_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image_type '{image_type}'. Allowed values: {', '.join(valid_types)}"
        )

    # Permission check: Residents can only upload issue images.
    # Repair completion photos can only be uploaded by staff or admin.
    if normalized_type == "repair" and current_user.role not in ["staff", "admin"]:
        raise HTTPException(
            status_code=403,
            detail="Only staff and admin can upload repair completion photos"
        )

    if not files:
        raise HTTPException(status_code=400, detail="No files provided for upload.")

    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        existing_count = session.query(ComplaintImage).filter(
            ComplaintImage.complaint_id == complaint.id
        ).count()

        if existing_count + len(files) > MAX_IMAGES_PER_COMPLAINT:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot upload {len(files)} image(s). A complaint can have at most {MAX_IMAGES_PER_COMPLAINT} images (currently has {existing_count})."
            )

        # Pre-validate all files to prevent partial uploads
        validated_files = []
        for file in files:
            file_bytes = await file.read()
            mime_type = validate_image_file(file.filename or "image.jpg", file.content_type or "", file_bytes)
            validated_files.append({
                "filename": file.filename or "image.jpg",
                "bytes": file_bytes,
                "mime_type": mime_type,
            })

        # Upload to Cloudinary and record metadata in PostgreSQL
        created_records = []
        for item in validated_files:
            upload_res = upload_image_to_cloudinary(
                item["bytes"],
                item["filename"],
                folder=f"complaint_{complaint_id}"
            )
            img_record = ComplaintImage(
                complaint_id=complaint.id,
                user_id=current_user.id,
                image_url=upload_res["secure_url"],
                public_id=upload_res.get("public_id"),
                image_type=normalized_type,
                original_filename=item["filename"],
                file_size=upload_res.get("bytes", len(item["bytes"])),
                mime_type=item["mime_type"],
            )
            session.add(img_record)
            created_records.append(img_record)

        session.commit()
        for rec in created_records:
            session.refresh(rec)

        return created_records


@router.get(
    "/complaints/{complaint_id}/images",
    response_model=list[ComplaintImageResponse]
)
def get_complaint_images(
    complaint_id: int,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)
        return (
            session.query(ComplaintImage)
            .filter(ComplaintImage.complaint_id == complaint.id)
            .order_by(ComplaintImage.created_at.asc())
            .all()
        )


@router.delete(
    "/complaints/{complaint_id}/images/{image_id}",
    status_code=200
)
def delete_complaint_image(
    complaint_id: int,
    image_id: int,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        complaint = _load_scoped_complaint(session, complaint_id, current_user)

        image = session.query(ComplaintImage).filter(
            ComplaintImage.id == image_id,
            ComplaintImage.complaint_id == complaint.id
        ).first()

        if not image:
            raise HTTPException(status_code=404, detail="Image not found")

        # Only uploader or admin can delete an image
        if current_user.role != "admin" and image.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this image")

        public_id = image.public_id

        try:
            session.delete(image)
            session.commit()
        except Exception as e:
            session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error deleting image: {str(e)}"
            )

        # Safely delete Cloudinary asset after DB commit succeeds
        if public_id:
            try:
                delete_image_from_cloudinary(public_id)
            except Exception as e:
                logger.error("Failed to delete Cloudinary asset %s: %s", public_id, e)

        return {"message": "Image deleted successfully"}
