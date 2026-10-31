import os
import unittest
from datetime import datetime, timedelta, timezone
import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-token-invalidation-tests"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.models.complaint import Complaint
from backend.security import (
    hash_password,
    create_password_reset_token,
    create_access_token,
    SECRET_KEY,
    ALGORITHM,
)
from backend.limiter import limiter
import backend.database as db_mod
import backend.routers.users as users_router
import backend.routers.complaints as complaints_router
import backend.routers.ai as ai_router
import backend.routers.reports as reports_router
import backend.security as sec_mod

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestPhase6TokenInvalidation(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=test_engine)

        db_mod.engine = test_engine
        users_router.engine = test_engine
        complaints_router.engine = test_engine
        ai_router.engine = test_engine
        reports_router.engine = test_engine
        sec_mod.engine = test_engine

        self.client = TestClient(app)
        limiter.reset()

        with TestingSessionLocal() as session:
            user = User(
                username="alice_session",
                password=hash_password("PassAlice123!"),
                email="alice_session@example.com",
                full_name="Alice Session",
                role="user",
                token_version=1,
            )
            staff = User(
                username="staff_session",
                password=hash_password("PassStaff123!"),
                email="staff_session@example.com",
                full_name="Staff Session",
                role="staff",
                token_version=1,
            )
            admin = User(
                username="admin_session",
                password=hash_password("PassAdmin123!"),
                email="admin_session@example.com",
                full_name="Admin Session",
                role="admin",
                token_version=1,
            )
            session.add_all([user, staff, admin])
            session.commit()

    def tearDown(self):
        limiter.reset()
        Base.metadata.drop_all(bind=test_engine)

    def test_newly_issued_access_token_works(self):
        login_resp = self.client.post(
            "/users/login",
            json={"username": "alice_session", "password": "PassAlice123!"},
        )
        self.assertEqual(login_resp.status_code, 200)
        token = login_resp.json()["access_token"]

        # Decode token and verify claim 'tv' is present
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        self.assertIn("tv", payload)
        self.assertEqual(payload["tv"], 1)

        # Access protected endpoint
        me_resp = self.client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["username"], "alice_session")

    def test_old_access_token_rejected_after_password_reset(self):
        # 1. Obtain an access token before reset
        login_resp = self.client.post(
            "/users/login",
            json={"username": "alice_session", "password": "PassAlice123!"},
        )
        old_token = login_resp.json()["access_token"]

        # Verify old token works before reset
        resp_before = self.client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        self.assertEqual(resp_before.status_code, 200)

        # 2. Reset password
        reset_token = create_password_reset_token("alice_session")
        reset_resp = self.client.post(
            "/users/reset-password",
            json={"token": reset_token, "new_password": "NewAlicePassword789!"},
        )
        self.assertEqual(reset_resp.status_code, 200)

        # 3. Old access token MUST now be rejected with HTTP 401
        resp_after = self.client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        self.assertEqual(resp_after.status_code, 401)
        self.assertIn("Session invalidated", resp_after.json()["detail"])

    def test_new_access_token_after_password_reset_succeeds(self):
        # Reset password
        reset_token = create_password_reset_token("alice_session")
        reset_resp = self.client.post(
            "/users/reset-password",
            json={"token": reset_token, "new_password": "BrandNewPassword123!"},
        )
        self.assertEqual(reset_resp.status_code, 200)

        # Login with new password
        login_resp = self.client.post(
            "/users/login",
            json={"username": "alice_session", "password": "BrandNewPassword123!"},
        )
        self.assertEqual(login_resp.status_code, 200)
        new_token = login_resp.json()["access_token"]

        # Verify new token's tv claim is incremented (tv == 2)
        payload = jwt.decode(new_token, SECRET_KEY, algorithms=[ALGORITHM])
        self.assertEqual(payload["tv"], 2)

        # New token succeeds on protected endpoints
        me_resp = self.client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {new_token}"},
        )
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["username"], "alice_session")

    def test_access_token_with_mismatched_token_version_rejected(self):
        # Issue token with forged/mismatched version claim tv=99
        payload = {
            "sub": "alice_session",
            "role": "user",
            "tv": 99,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        }
        forged_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

        resp = self.client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {forged_token}"},
        )
        self.assertEqual(resp.status_code, 401)
        self.assertIn("Session invalidated", resp.json()["detail"])

    def test_access_token_missing_tv_claim_rejected(self):
        # Legacy token that does not contain the 'tv' claim
        payload = {
            "sub": "alice_session",
            "role": "user",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        }
        legacy_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

        resp = self.client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {legacy_token}"},
        )
        self.assertEqual(resp.status_code, 401)
        self.assertIn("missing token version claim", resp.json()["detail"])

    def test_password_change_via_profile_patch_also_invalidates_old_sessions(self):
        # 1. Login to get token
        login_resp = self.client.post(
            "/users/login",
            json={"username": "alice_session", "password": "PassAlice123!"},
        )
        old_token = login_resp.json()["access_token"]

        # 2. Update password via PATCH /users/me
        patch_resp = self.client.patch(
            "/users/me",
            headers={"Authorization": f"Bearer {old_token}"},
            json={
                "current_password": "PassAlice123!",
                "new_password": "ProfileUpdatedPass456!",
            },
        )
        self.assertEqual(patch_resp.status_code, 200)

        # 3. Old token should now be rejected
        subsequent_resp = self.client.get(
            "/users/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        self.assertEqual(subsequent_resp.status_code, 401)

        # 4. New login succeeds
        new_login = self.client.post(
            "/users/login",
            json={"username": "alice_session", "password": "ProfileUpdatedPass456!"},
        )
        self.assertEqual(new_login.status_code, 200)

    def test_standard_complaint_workflows_continue_without_regression(self):
        # User submits complaint with active token
        login_resp = self.client.post(
            "/users/login",
            json={"username": "alice_session", "password": "PassAlice123!"},
        )
        user_token = login_resp.json()["access_token"]

        complaint_resp = self.client.post(
            "/complaints",
            headers={"Authorization": f"Bearer {user_token}"},
            json={
                "title": "Broken AC Unit",
                "description": "The AC in the conference room is leaking water.",
            },
        )
        self.assertEqual(complaint_resp.status_code, 201)
        complaint_id = complaint_resp.json()["id"]

        # Admin assigns complaint to staff
        admin_login = self.client.post(
            "/users/login",
            json={"username": "admin_session", "password": "PassAdmin123!"},
        )
        admin_token = admin_login.json()["access_token"]

        with TestingSessionLocal() as session:
            staff_user = session.query(User).filter(User.username == "staff_session").first()
            staff_id = staff_user.id

        assign_resp = self.client.patch(
            f"/complaints/{complaint_id}/assign",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"assigned_staff_id": staff_id},
        )
        self.assertEqual(assign_resp.status_code, 200)

        # Staff updates complaint status
        staff_login = self.client.post(
            "/users/login",
            json={"username": "staff_session", "password": "PassStaff123!"},
        )
        staff_token = staff_login.json()["access_token"]

        update_resp = self.client.patch(
            f"/complaints/{complaint_id}",
            headers={"Authorization": f"Bearer {staff_token}"},
            json={"status": "in_progress"},
        )
        self.assertEqual(update_resp.status_code, 200)
        self.assertEqual(update_resp.json()["status"], "in_progress")

    def test_migration_safely_adds_token_version_column(self):
        from sqlalchemy import inspect as sa_inspect, text
        import backend.migrate as migrate_mod

        # Create isolated engine with users table lacking token_version
        mig_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with mig_engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE users ("
                    "id INTEGER PRIMARY KEY, "
                    "username VARCHAR(100) UNIQUE NOT NULL, "
                    "password VARCHAR(255) NOT NULL, "
                    "email VARCHAR(255) UNIQUE, "
                    "full_name VARCHAR(255), "
                    "role VARCHAR(50) NOT NULL DEFAULT 'user', "
                    "created_at TIMESTAMP)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO users (username, password, email, role) VALUES ('legacy_user', 'hashed_pass', 'legacy@example.com', 'user')"
                )
            )

        orig_engine = migrate_mod.engine
        try:
            migrate_mod.engine = mig_engine
            migrate_mod.run_migrations()

            insp = sa_inspect(mig_engine)
            cols = [c["name"] for c in insp.get_columns("users")]
            self.assertIn("token_version", cols)

            with mig_engine.connect() as conn:
                res = conn.execute(
                    text("SELECT token_version FROM users WHERE username = 'legacy_user'")
                ).fetchone()
                self.assertEqual(res[0], 1)
        finally:
            migrate_mod.engine = orig_engine


if __name__ == "__main__":
    unittest.main()
