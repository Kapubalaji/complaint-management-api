from fastapi import APIRouter, HTTPException,Depends
from sqlalchemy.orm import Session
from backend.models.user import User
from backend.database import engine
from backend.models.complaint import Complaint
from backend.security import get_current_user
from backend.schemas import (ComplaintCreate, 
                            ComplaintResponse,
                            ComplaintUpdate,
                            ComplaintPatch)

router = APIRouter()


@router.get(
    "/complaints",
    response_model=list[ComplaintResponse]
)
def get_complaints(current_user: str = Depends(get_current_user)):
    with Session(engine) as session:
    
        user = session.query(User).filter(
                    User.username == current_user
                ).first()
        
        complaints = session.query(Complaint).filter(
            Complaint.user_id == user.id
        ).all()
    return complaints

@router.post(
    "/complaints",
    response_model=ComplaintResponse
)
def create_complaint(complaint_data: ComplaintCreate,
                     current_user: str = Depends(get_current_user)):
    with Session(engine) as session:
    
        user = session.query(User).filter(
            User.username == current_user
        ).first()
    
        complaint = Complaint(
            title=complaint_data.title,
            description=complaint_data.description,
            status=complaint_data.status,
            user_id = user.id
        )

        session.add(complaint)
        session.commit()
        session.refresh(complaint)

        return complaint

@router.get(
    "/complaints/{complaint_id}",
    response_model=ComplaintResponse
)
def get_complaint(complaint_id: int, current_user: str = Depends(get_current_user)):
    with Session(engine) as session:

        user = session.query(User).filter(
                    User.username == current_user
                ).first()
    
        complaint = session.query(Complaint).filter(
            Complaint.id == complaint_id,
            Complaint.user_id == user.id
        ).first()
        
        if complaint is None:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found"
            )

        return complaint

@router.put("/complaints/{complaint_id}", response_model=ComplaintResponse)
def update_complaint(
    complaint_id: int,
    complaint_data: ComplaintUpdate,
    current_user: str = Depends(get_current_user)
):
    with Session(engine) as session:

        user = session.query(User).filter(
            User.username == current_user
        ).first()

    
        complaint = session.query(Complaint).filter(
            Complaint.id == complaint_id,
            Complaint.user_id == user.id
        ).first()
        
        if complaint is None:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found"
            )

        complaint.title = complaint_data.title
        complaint.description = complaint_data.description
        complaint.status = complaint_data.status

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
    current_user: str = Depends(get_current_user)
):
    with Session(engine) as session:

    
        user = session.query(User).filter(
            User.username == current_user
        ).first()

        complaint = session.query(Complaint).filter(
            Complaint.id == complaint_id,
            Complaint.user_id == user.id
        ).first()
        
        if complaint is None:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found"
            )

        update_data = complaint_data.model_dump(exclude_unset=True) #pydantic object

        for field, value in update_data.items():
            setattr(complaint, field, value)

        session.commit()
        session.refresh(complaint)

        return complaint

@router.delete("/complaints/{complaint_id}")
def delete_complaint(complaint_id: int,  current_user: str = Depends(get_current_user)):
    with Session(engine) as session:

    
        user = session.query(User).filter(
            User.username == current_user
        ).first()

        complaint = session.query(Complaint).filter(
            Complaint.id == complaint_id,
            Complaint.user_id == user.id
        ).first()
        
        if complaint is None:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found"
            )

        session.delete(complaint)
        session.commit()

    return {"message": "Complaint deleted successfully"}
