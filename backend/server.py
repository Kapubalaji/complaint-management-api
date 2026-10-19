from fastapi import FastAPI
import os
from fastapi.middleware.cors import CORSMiddleware
from backend.database import engine, Base
from backend.models.user import User
from backend.routers.complaints import router
from backend.routers.users import router as user_router

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(user_router)



# @app.get("/")
# def home():
#     return {"message": "Complaint Management api"}

