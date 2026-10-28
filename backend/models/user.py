from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False, unique=True)
    password = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True, unique=True)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, default="user")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
