import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base

load_dotenv()

DATABASE_URL =os.getenv("postgresql+psycopg2://complaint_app:Jermia%40678@localhost/complaint_management")
engine = create_engine(DATABASE_URL)
Base = declarative_base()
