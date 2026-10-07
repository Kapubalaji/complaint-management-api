# from sqlalchemy import Column, Integer, String, Text
# from backend.database import Base
# 
# class Complaint(Base):
#     __tablename__ = "complaints"
# 
#     id = Column(Integer, primary_key=True)
#     title = Column(String(200), nullable=False)
#     description = Column(Text, nullable=False)
#     status = Column(String(50), nullable=False, default="open")
from sqlalchemy import Column, Integer, String, Text
from backend.database import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="open")
    user_id = Column(Integer, nullable=False)
