import os
import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Set env before importing backend modules
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase1-tests"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.models.complaint import Complaint, ComplaintComment
from backend.security import hash_password, create_access_token

# Create SQLite in-memory test engine
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

class TestPhase1RBAC(unittest.TestCase):

    def setUp(self):
        Base.metadata.create_all(bind=test_engine)
        
        # Monkeypatch engine in imported modules
        import backend.database as db_mod
        import backend.routers.users as users_router
        import backend.routers.complaints as complaints_router
        import backend.security as sec_mod

        db_mod.engine = test_engine
        users_router.engine = test_engine
        complaints_router.engine = test_engine
        sec_mod.engine = test_engine

        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(bind=test_engine)

    def create_test_user(self, username: str, role: str = "user"):
        session = TestingSessionLocal()
        user = User(
            username=username,
            password=hash_password("password123"),
            email=f"{username}@example.com",
            full_name=f"Test {username.capitalize()}",
            role=role
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.close()
        return user

    def test_user_registration_defaults_to_user_role(self):
        response = self.client.post(
            "/users/register",
            json={
                "username": "alice",
                "password": "password123",
                "email": "alice@example.com",
                "full_name": "Alice Smith"
            }
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["username"], "alice")
        self.assertEqual(data["role"], "user")

    def test_login_returns_token_and_role(self):
        self.create_test_user("bob", role="user")
        response = self.client.post(
            "/users/login",
            json={"username": "bob", "password": "password123"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["role"], "user")
        self.assertEqual(data["username"], "bob")

    def test_standard_user_cannot_access_other_users_complaint(self):
        user1 = self.create_test_user("user1", role="user")
        user2 = self.create_test_user("user2", role="user")

        token1 = create_access_token(user1.username, role=user1.role)
        token2 = create_access_token(user2.username, role=user2.role)

        res = self.client.post(
            "/complaints",
            json={"title": "Private Issue", "description": "User 1 data"},
            headers={"Authorization": f"Bearer {token1}"}
        )
        self.assertEqual(res.status_code, 201)
        complaint_id = res.json()["id"]

        res2 = self.client.get(
            f"/complaints/{complaint_id}",
            headers={"Authorization": f"Bearer {token2}"}
        )
        self.assertEqual(res2.status_code, 404)

    def test_staff_and_admin_can_view_all_complaints(self):
        user = self.create_test_user("user_reg", role="user")
        staff = self.create_test_user("staff1", role="staff")

        user_token = create_access_token(user.username, role=user.role)
        staff_token = create_access_token(staff.username, role=staff.role)

        self.client.post(
            "/complaints",
            json={"title": "Printer Broken", "description": "Needs toner"},
            headers={"Authorization": f"Bearer {user_token}"}
        )

        res = self.client.get("/complaints", headers={"Authorization": f"Bearer {staff_token}"})
        self.assertEqual(res.status_code, 200)
        complaints = res.json()
        self.assertEqual(len(complaints), 1)
        self.assertEqual(complaints[0]["title"], "Printer Broken")

    def test_non_admin_cannot_change_user_roles(self):
        user = self.create_test_user("regular_guy", role="user")
        victim = self.create_test_user("victim_guy", role="user")

        user_token = create_access_token(user.username, role=user.role)

        res = self.client.patch(
            f"/users/{victim.id}/role",
            json={"role": "admin"},
            headers={"Authorization": f"Bearer {user_token}"}
        )
        self.assertEqual(res.status_code, 403)

    def test_admin_can_change_user_roles(self):
        admin = self.create_test_user("superadmin", role="admin")
        target = self.create_test_user("promoted_staff", role="user")

        admin_token = create_access_token(admin.username, role=admin.role)

        res = self.client.patch(
            f"/users/{target.id}/role",
            json={"role": "staff"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], "staff")

    def test_comments_and_internal_visibility(self):
        user = self.create_test_user("reporter", role="user")
        staff = self.create_test_user("support_agent", role="staff")

        user_token = create_access_token(user.username, role=user.role)
        staff_token = create_access_token(staff.username, role=staff.role)

        res = self.client.post(
            "/complaints",
            json={"title": "Wi-Fi down", "description": "Building B"},
            headers={"Authorization": f"Bearer {user_token}"}
        )
        cid = res.json()["id"]

        res_internal = self.client.post(
            f"/complaints/{cid}/comments",
            json={"comment": "Checking router firmware", "is_internal": True},
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        self.assertEqual(res_internal.status_code, 201)

        self.client.post(
            f"/complaints/{cid}/comments",
            json={"comment": "We are looking into this issue.", "is_internal": False},
            headers={"Authorization": f"Bearer {staff_token}"}
        )

        u_comments = self.client.get(
            f"/complaints/{cid}/comments",
            headers={"Authorization": f"Bearer {user_token}"}
        ).json()
        self.assertEqual(len(u_comments), 1)
        self.assertEqual(u_comments[0]["comment"], "We are looking into this issue.")

        s_comments = self.client.get(
            f"/complaints/{cid}/comments",
            headers={"Authorization": f"Bearer {staff_token}"}
        ).json()
        self.assertEqual(len(s_comments), 2)

if __name__ == "__main__":
    unittest.main()
