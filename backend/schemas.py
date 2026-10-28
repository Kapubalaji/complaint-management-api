from datetime import datetime
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None
    full_name: str | None = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    full_name: str | None = None
    role: str
    created_at: datetime | None = None

    model_config = {
        "from_attributes": True
    }

class UserLogin(BaseModel):
    username: str
    password: str

class UserRoleUpdate(BaseModel):
    role: str

class UserUpdateAdmin(BaseModel):
    email: str | None = None
    full_name: str | None = None
    role: str | None = None

class UserProfileUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    current_password: str | None = None
    new_password: str | None = None

class PasswordResetRequest(BaseModel):
    username: str
    email: str | None = None

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class ComplaintCreate(BaseModel):
    title: str
    description: str
    status: str = "open"
    category: str | None = None
    priority: str | None = None

class ComplaintResponse(BaseModel):
    id: int
    title: str
    description: str
    status: str
    category: str | None = "General"
    priority: str | None = "Medium"
    user_id: int
    assigned_staff_id: int | None = None
    suggested_staff_id: int | None = None
    sentiment: str | None = None
    ai_summary: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    resolved_at: datetime | None = None

    model_config = {
        "from_attributes": True
    }

class AIAnalysisResult(BaseModel):
    category: str
    sentiment: str
    priority: str
    ai_summary: str
    suggested_staff_id: int | None = None
    provider_used: str  # "openai", "anthropic", or "rule_engine_fallback"

class ComplaintStatusUpdate(BaseModel):
    status: str
    resolution_note: str | None = None

class ComplaintPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    category: str | None = None
    priority: str | None = None
    assigned_staff_id: int | None = None

class ComplaintUpdate(BaseModel):
    title: str
    description: str
    status: str
    category: str | None = "General"
    priority: str | None = "Medium"
    assigned_staff_id: int | None = None

class ComplaintAssign(BaseModel):
    assigned_staff_id: int

class CommentCreate(BaseModel):
    comment: str
    is_internal: bool = False

class CommentResponse(BaseModel):
    id: int
    complaint_id: int
    user_id: int
    comment: str
    is_internal: bool
    created_at: datetime | None = None

    model_config = {
        "from_attributes": True
    }

class ResolutionStats(BaseModel):
    resolved_count: int = 0
    total_count: int = 0
    resolution_rate: float = 0.0
    avg_resolution_hours: float | None = None

class TrendPoint(BaseModel):
    date: str
    created: int = 0
    resolved: int = 0

class MyWorkload(BaseModel):
    active_count: int = 0
    total_count: int = 0
    resolved_count: int = 0

class StaffWorkload(BaseModel):
    id: int
    username: str
    full_name: str
    active_count: int = 0
    total_count: int = 0
    resolved_count: int = 0

class AnalyticsResponse(BaseModel):
    scope: str  # "user" | "staff" | "admin"
    generated_at: datetime
    totals: dict[str, int]
    by_priority: dict[str, int]
    by_category: dict[str, int]
    by_sentiment: dict[str, int]
    resolution: ResolutionStats
    trend: list[TrendPoint]
    my_workload: MyWorkload | None = None
    staff_workload: list[StaffWorkload] = []
