from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from backend.database import engine
from backend.models.user import User
from backend.schemas import UserCreate, UserResponse, UserLogin
from backend.security import hash_password, verify_password,create_access_token


router = APIRouter()


@router.post(
    "/users/register",
    response_model=UserResponse,
    status_code=201
)
def register_user(user_data: UserCreate):
    with Session(engine) as session:
        user = User(
            username=user_data.username,
            password=hash_password(user_data.password)
        )


        session.add(user)

        try:
            session.commit()
            session.refresh(user)
        except IntegrityError:
            session.rollback()
            raise HTTPException(
                status_code=409,
                detail="Username already exists."
            )

        return user

@router.post("/users/login")
def login_user(user_data: UserLogin):
    with Session(engine) as session:
        user = session.query(User).filter(
            User.username == user_data.username
        ).first()

        if user is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid username or password"
            )

        if not verify_password(
            user_data.password,
            user.password
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid username or password"
            )

        access_token = create_access_token(user.username)

        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
