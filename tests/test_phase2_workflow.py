import os
import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase2-tests"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.models.complaint import Complaint, ComplaintComment
from backend.security import hash_password, create_access_token

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

class TestPhase2Workflow(unittest.TestCase):

    def setUp(self):
        Base.metadata.create_all(bind=test_engine)

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

    def create_user(self, username: str, role: str = "user", email: str = None):
        session = TestingSessionLocal()
        user = User(
            username=username,
            password=hash_password("password123"),
            email=email or f"{username}@example.com",
            full_name=f"{username.capitalize()} User",
            role=role
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.close()
        return user

    def test_forgot_password_does_not_leak_reset_token(self):
        self.create_user("charlie", email="charlie@example.com")

        res = self.client.post(
            "/users/forgot-password",
            json={"username": "charlie", "email": "charlie@example.com"},
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        # Security: API must never return a usable reset token
        self.assertNotIn("reset_token", payload)
        self.assertIn("message", payload)

        # Same uniform response for unknown accounts (no enumeration)
        res_unknown = self.client.post(
            "/users/forgot-password",
            json={"username": "nobody-here"},
        )
        self.assertEqual(res_unknown.status_code, 200)
        self.assertNotIn("reset_token", res_unknown.json())
        self.assertEqual(res_unknown.json()["message"], payload["message"])

    def test_reset_password_with_server_issued_token(self):
        from backend.security import create_password_reset_token

        self.create_user("charlie2", email="charlie2@example.com")

        # Token is issued server-side (e.g. future email delivery), never via API body
        reset_token = create_password_reset_token("charlie2")
        res2 = self.client.post(
            "/users/reset-password",
            json={"token": reset_token, "new_password": "newpassword123"},
        )
        self.assertEqual(res2.status_code, 200)

        login_res = self.client.post(
            "/users/login",
            json={"username": "charlie2", "password": "newpassword123"},
        )
        self.assertEqual(login_res.status_code, 200)

    def test_admin_user_management(self):
        admin = self.create_user("admin_user", role="admin")
        self.create_user("staff_member", role="staff")
        user1 = self.create_user("standard_user", role="user")

        admin_token = create_access_token(admin.username, role=admin.role)

        # List all users
        res = self.client.get("/users", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 3)

        # Update user details as admin
        res_update = self.client.patch(
            f"/users/{user1.id}",
            json={"full_name": "Updated Standard User"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["full_name"], "Updated Standard User")

    def test_staff_queues_and_status_transition(self):
        user = self.create_user("complainer", role="user")
        staff = self.create_user("agent007", role="staff")
        admin = self.create_user("admin_agent", role="admin")

        user_token = create_access_token(user.username, role=user.role)
        staff_token = create_access_token(staff.username, role=staff.role)
        admin_token = create_access_token(admin.username, role=admin.role)

        # User submits complaint
        res_comp = self.client.post(
            "/complaints",
            json={"title": "AC not cooling", "description": "Room 302"},
            headers={"Authorization": f"Bearer {user_token}"}
        )
        cid = res_comp.json()["id"]

        # Staff cannot list the unassigned queue (admin-only assignment workflow)
        res_unassigned_staff = self.client.get(
            "/complaints/unassigned",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        self.assertEqual(res_unassigned_staff.status_code, 403)

        # Admin sees unassigned queue
        res_unassigned = self.client.get(
            "/complaints/unassigned",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        self.assertEqual(res_unassigned.status_code, 200)
        self.assertEqual(len(res_unassigned.json()), 1)

        # Staff cannot self-assign
        res_assign_staff = self.client.patch(
            f"/complaints/{cid}/assign",
            json={"assigned_staff_id": staff.id},
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        self.assertEqual(res_assign_staff.status_code, 403)

        # Admin assigns complaint to staff
        res_assign = self.client.patch(
            f"/complaints/{cid}/assign",
            json={"assigned_staff_id": staff.id},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        self.assertEqual(res_assign.status_code, 200)

        # Staff checks 'assigned-to-me' queue
        res_assigned = self.client.get(
            "/complaints/assigned-to-me",
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        self.assertEqual(res_assigned.status_code, 200)
        self.assertEqual(len(res_assigned.json()), 1)

        # Staff updates status to 'resolved' with a resolution note
        res_status = self.client.patch(
            f"/complaints/{cid}/status",
            json={"status": "resolved", "resolution_note": "Replaced AC filter"},
            headers={"Authorization": f"Bearer {staff_token}"}
        )
        self.assertEqual(res_status.status_code, 200)
        self.assertEqual(res_status.json()["status"], "resolved")
        self.assertIsNotNone(res_status.json()["resolved_at"])

        # Check comment thread contains resolution note
        comments = self.client.get(
            f"/complaints/{cid}/comments",
            headers={"Authorization": f"Bearer {user_token}"}
        ).json()
        self.assertTrue(any("Replaced AC filter" in c["comment"] for c in comments))

if __name__ == "__main__":
    unittest.main()
