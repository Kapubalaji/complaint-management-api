from pydantic import BaseModel

class ComplaintCreate(BaseModel):
    title: str
    description: str
    status: str = "open"

class ComplaintResponse(BaseModel):
    id: int
    title: str
    description: str
    status: str

    model_config = {
        "from_attributes": True
    }

class ComplaintPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None

class ComplaintUpdate(BaseModel):
    title: str
    description: str
    status: str

class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str

class UserLogin(BaseModel):
    username: str
    password: str
