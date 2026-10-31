from sqlalchemy import inspect, text
from backend.database import engine, Base
import backend.models  # Ensures all models are registered

def run_migrations():
    """
    Safely migrates database schema without dropping existing tables or data.
    Adds missing columns to 'users' and 'complaints' tables, and creates
    'complaint_comments' table if it does not exist.
    """
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    # 1. Ensure all new tables (e.g. complaint_comments) are created
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        # 2. Migrate 'users' table
        if "users" in existing_tables:
            user_columns = [col["name"] for col in inspector.get_columns("users")]
            
            if "email" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE;"))
            
            if "full_name" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(255);"))
            
            if "role" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user';"))
            
            if "token_version" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;"))
            else:
                conn.execute(text("UPDATE users SET token_version = 1 WHERE token_version IS NULL;"))
            
            if "created_at" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;"))

        # 3. Migrate 'complaints' table
        if "complaints" in existing_tables:
            complaint_columns = [col["name"] for col in inspector.get_columns("complaints")]
            
            if "category" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN category VARCHAR(100) DEFAULT 'General';"))
            
            if "priority" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN priority VARCHAR(50) DEFAULT 'Medium';"))
            
            if "assigned_staff_id" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN assigned_staff_id INTEGER REFERENCES users(id);"))
            
            if "sentiment" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN sentiment VARCHAR(50);"))
            
            if "ai_summary" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN ai_summary TEXT;"))
            
            if "suggested_staff_id" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN suggested_staff_id INTEGER REFERENCES users(id);"))
            
            if "created_at" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;"))
            
            if "updated_at" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;"))
            
            if "resolved_at" not in complaint_columns:
                conn.execute(text("ALTER TABLE complaints ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;"))

if __name__ == "__main__":
    run_migrations()
    print("Database migration completed successfully.")
