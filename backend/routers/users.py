from fastapi import APIRouter, HTTPException, Depends, status, Query, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from backend.database import engine
from backend.models.user import User
from backend.limiter import limiter
from backend.services.email_service import send_password_reset_email
from backend.schemas import (
    UserCreate,
    UserResponse,
    UserLogin,
    UserRoleUpdate,
    UserUpdateAdmin,
    UserProfileUpdate,
    PasswordResetRequest,
    PasswordResetConfirm
)
from backend.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    get_password_fingerprint,
    verify_password_reset_token,
    get_current_user,
    require_role
)

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
            password=hash_password(user_data.password),
            email=user_data.email,
            full_name=user_data.full_name,
            role="user"
        )

        session.add(user)

        try:
            session.commit()
            session.refresh(user)
        except IntegrityError:
            session.rollback()
            raise HTTPException(
                status_code=409,
                detail="Username or email already exists."
            )

        return user

@router.post("/users/login")
@limiter.limit("5/minute")
def login_user(request: Request, user_data: UserLogin):
    with Session(engine) as session:
        user = session.query(User).filter(
            User.username == user_data.username
        ).first()

        if user is None or not verify_password(user_data.password, user.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )

        tv = user.token_version if user.token_version is not None else 1
        access_token = create_access_token(user.username, role=user.role, token_version=tv)

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role,
            "username": user.username,
            "user_id": user.id
        }

@router.post("/users/forgot-password")
@limiter.limit("5/minute")
def forgot_password_request(
    request: Request,
    req: PasswordResetRequest,
    background_tasks: BackgroundTasks,
):
    with Session(engine) as session:
        query = session.query(User).filter(User.username == req.username)
        if req.email:
            query = query.filter(User.email == req.email)
        user = query.first()

        # If user exists and has an email, issue a signed token and schedule background delivery
        if user and user.email:
            reset_token = create_password_reset_token(user.username, user.password)
            background_tasks.add_task(
                send_password_reset_email,
                to_email=user.email,
                username=user.username,
                reset_token=reset_token,
            )

    # Always return a uniform generic response to prevent account enumeration.
    # Tokens are never returned in the API response under any condition.
    return {
        "message": (
            "If an account matches those details, password reset instructions "
            "have been prepared."
        )
    }


@router.post("/users/reset-password")
@limiter.limit("5/minute")
def reset_password_confirm(request: Request, req: PasswordResetConfirm):
    payload = decode_password_reset_token(req.token)
    username = payload.get("sub")
    token_fp = payload.get("fp")

    with Session(engine) as session:
        user = session.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Invalidate if password hash fingerprint no longer matches current password
        current_fp = get_password_fingerprint(user.password)
        if not token_fp or token_fp != current_fp:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired reset token: password has already been changed or token is invalid",
            )

        # Update password and increment token version transactionally
        user.password = hash_password(req.new_password)
        user.token_version = (user.token_version or 1) + 1
        session.commit()

        return {"message": "Password has been successfully reset. You may now sign in."}

@router.get("/users/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/users/me", response_model=UserResponse)
def update_current_user_profile(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    with Session(engine) as session:
        user = session.query(User).filter(User.id == current_user.id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if data.email:
            user.email = data.email
        if data.full_name:
            user.full_name = data.full_name

        if data.new_password:
            if not data.current_password or not verify_password(data.current_password, user.password):
                raise HTTPException(status_code=400, detail="Incorrect current password")
            user.password = hash_password(data.new_password)
            user.token_version = (user.token_version or 1) + 1

        try:
            session.commit()
            session.refresh(user)
            return user
        except IntegrityError:
            session.rollback()
            raise HTTPException(status_code=409, detail="Email already in use")

@router.get("/users/staff", response_model=list[UserResponse])
def list_staff_members(current_user: User = Depends(require_role(["admin", "staff"]))):
    with Session(engine) as session:
        staff_list = session.query(User).filter(User.role.in_(["staff", "admin"])).all()
        return staff_list

@router.get("/users", response_model=list[UserResponse])
def admin_list_users(
    role: str | None = Query(None),
    search: str | None = Query(None),
    admin_user: User = Depends(require_role(["admin"]))
):
    with Session(engine) as session:
        query = session.query(User)
        if role:
            query = query.filter(User.role == role)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    User.username.ilike(search_pattern),
                    User.email.ilike(search_pattern),
                    User.full_name.ilike(search_pattern)
                )
            )
        return query.order_by(User.id.asc()).all()

@router.get("/users/{user_id}", response_model=UserResponse)
def admin_get_user(
    user_id: int,
    admin_user: User = Depends(require_role(["admin"]))
):
    with Session(engine) as session:
        user = session.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

@router.patch("/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    role_data: UserRoleUpdate,
    admin_user: User = Depends(require_role(["admin"]))
):
    valid_roles = ["user", "staff", "admin"]
    if role_data.role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )

    with Session(engine) as session:
        user = session.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.role = role_data.role
        session.commit()
        session.refresh(user)
        return user

@router.patch("/users/{user_id}", response_model=UserResponse)
def admin_update_user(
    user_id: int,
    data: UserUpdateAdmin,
    admin_user: User = Depends(require_role(["admin"]))
):
    with Session(engine) as session:
        user = session.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if data.email is not None:
            user.email = data.email
        if data.full_name is not None:
            user.full_name = data.full_name
        if data.role is not None:
            if data.role not in ["user", "staff", "admin"]:
                raise HTTPException(status_code=400, detail="Invalid role specified")
            user.role = data.role

        try:
            session.commit()
            session.refresh(user)
            return user
        except IntegrityError:
            session.rollback()
            raise HTTPException(status_code=409, detail="Email already exists")

@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    admin_user: User = Depends(require_role(["admin"]))
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Admin cannot delete their own account")

    with Session(engine) as session:
        user = session.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        session.delete(user)
        session.commit()
        return {"message": "User deleted successfully"}
