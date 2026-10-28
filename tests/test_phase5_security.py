import os
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase5-security-tests"

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


class TestPhase5Security(unittest.TestCase):
    """Final permission matrix checks for user, staff, and admin roles."""

    def setUp(self):
        Base.metadata.create_all(bind=test_engine)

        import backend.database as db_mod
        import backend.routers.users as users_router
        import backend.routers.complaints as complaints_router
        import backend.routers.ai as ai_router
        import backend.routers.reports as reports_router
        import backend.security as sec_mod

        db_mod.engine = test_engine
        users_router.engine = test_engine
        complaints_router.engine = test_engine
        ai_router.engine = test_engine
        reports_router.engine = test_engine
        sec_mod.engine = test_engine

        os.environ.pop("OPENAI_API_KEY", None)
        os.environ.pop("AI_API_KEY", None)

        self.client = TestClient(app)

        self.user = self.create_user("plain_user", role="user")
        self.other_user = self.create_user("other_user", role="user")
        self.staff = self.create_user("helpdesk", role="staff")
        self.admin = self.create_user("rootadmin", role="admin")

        self.own_complaint = self.create_complaint(self.user.id, title="My issue")
        self.foreign_complaint = self.create_complaint(
            self.other_user.id, title="Someone elses issue"
        )

    def tearDown(self):
        Base.metadata.drop_all(bind=test_engine)

    def create_user(self, username: str, role: str = "user"):
        session = TestingSessionLocal()
        user = User(
            username=username,
            password=hash_password("password123"),
            email=f"{username}@example.com",
            full_name=f"{username.capitalize()} User",
            role=role,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id
        session.close()
        return self.get_user(user_id)

    def get_user(self, user_id: int) -> User:
        session = TestingSessionLocal()
        user = session.get(User, user_id)
        session.close()
        return user

    def create_complaint(self, owner_id: int, title: str = "Issue") -> int:
        session = TestingSessionLocal()
        complaint = Complaint(
            title=title,
            description="Description of the issue under test.",
            status="open",
            category="General",
            priority="Medium",
            user_id=owner_id,
        )
        session.add(complaint)
        session.commit()
        session.refresh(complaint)
        complaint_id = complaint.id
        session.close()
        return complaint_id

    def auth(self, user) -> dict:
        token = create_access_token(user.username, role=user.role)
        return {"Authorization": f"Bearer {token}"}

    # --- Authentication ---

    def test_protected_endpoints_reject_missing_or_bad_tokens(self):
        endpoints = [
            ("GET", "/complaints"),
            ("GET", "/reports/analytics"),
            ("GET", "/reports/export"),
            ("GET", "/users/me"),
            ("GET", "/users"),
            ("POST", "/complaints"),
        ]

        for method, path in endpoints:
            with self.subTest(method=method, path=path, case="no_token"):
                resp = self.client.request(method, path)
                self.assertEqual(resp.status_code, 401, f"{method} {path}")

            with self.subTest(method=method, path=path, case="bad_token"):
                resp = self.client.request(
                    method,
                    path,
                    headers={"Authorization": "Bearer garbage.token.here"},
                )
                self.assertEqual(resp.status_code, 401, f"{method} {path}")

    def test_db_role_is_source_of_truth_not_token_claim(self):
        # Token claims admin, but the database says this account is a plain user.
        forged = create_access_token(self.user.username, role="admin")
        resp = self.client.get(
            "/users", headers={"Authorization": f"Bearer {forged}"}
        )
        self.assertEqual(resp.status_code, 403)

    # --- Standard user restrictions ---

    def test_user_cannot_reach_staff_endpoints(self):
        staff_only = [
            ("GET", "/complaints/assigned-to-me"),
            ("GET", "/complaints/unassigned"),
            ("GET", "/users/staff"),
            ("PATCH", f"/complaints/{self.own_complaint}/status"),
            ("PATCH", f"/complaints/{self.own_complaint}/assign"),
        ]

        for method, path in staff_only:
            with self.subTest(endpoint=f"{method} {path}"):
                kwargs = {"headers": self.auth(self.user)}
                if method != "GET":
                    kwargs["json"] = {
                        "status": "open",
                        "assigned_staff_id": self.staff.id,
                    }
                resp = self.client.request(method, path, **kwargs)
                self.assertEqual(resp.status_code, 403, f"{method} {path}")

    def test_user_cannot_reach_admin_endpoints(self):
        admin_only = [
            ("GET", "/users"),
            ("GET", f"/users/{self.other_user.id}"),
            ("PATCH", f"/users/{self.other_user.id}/role"),
            ("PATCH", f"/users/{self.other_user.id}"),
            ("DELETE", f"/users/{self.other_user.id}"),
        ]

        for method, path in admin_only:
            with self.subTest(endpoint=f"{method} {path}"):
                kwargs = {"headers": self.auth(self.user)}
                if method != "GET":
                    kwargs["json"] = {"role": "admin", "email": "x@example.com"}
                resp = self.client.request(method, path, **kwargs)
                self.assertEqual(resp.status_code, 403, f"{method} {path}")

        # Staff are blocked from the same admin-only surface.
        for method, path in admin_only:
            with self.subTest(endpoint=f"{method} {path}", role="staff"):
                kwargs = {"headers": self.auth(self.staff)}
                if method != "GET":
                    kwargs["json"] = {"role": "admin", "email": "x@example.com"}
                resp = self.client.request(method, path, **kwargs)
                self.assertEqual(resp.status_code, 403, f"{method} {path}")

    def test_user_cannot_escalate_own_role(self):
        resp = self.client.patch(
            f"/users/{self.user.id}/role",
            headers=self.auth(self.user),
            json={"role": "admin"},
        )
        self.assertEqual(resp.status_code, 403)

        fresh = self.get_user(self.user.id)
        self.assertEqual(fresh.role, "user")

    def test_user_cannot_assign_staff_via_complaint_update(self):
        resp = self.client.patch(
            f"/complaints/{self.own_complaint}",
            headers=self.auth(self.user),
            json={"assigned_staff_id": self.staff.id},
        )
        self.assertEqual(resp.status_code, 403)

        resp = self.client.put(
            f"/complaints/{self.own_complaint}",
            headers=self.auth(self.user),
            json={
                "title": "My issue",
                "description": "Updated",
                "status": "open",
                "assigned_staff_id": self.staff.id,
            },
        )
        self.assertEqual(resp.status_code, 403)

    # --- Data isolation ---

    def test_user_cannot_read_or_modify_foreign_complaint(self):
        headers = self.auth(self.user)

        resp = self.client.get(f"/complaints/{self.foreign_complaint}", headers=headers)
        self.assertEqual(resp.status_code, 404)

        resp = self.client.patch(
            f"/complaints/{self.foreign_complaint}",
            headers=headers,
            json={"title": "hijacked"},
        )
        self.assertEqual(resp.status_code, 404)

        resp = self.client.delete(
            f"/complaints/{self.foreign_complaint}", headers=headers
        )
        self.assertEqual(resp.status_code, 404)

        resp = self.client.get(
            f"/complaints/{self.foreign_complaint}/comments", headers=headers
        )
        self.assertEqual(resp.status_code, 404)

        resp = self.client.post(
            f"/complaints/{self.foreign_complaint}/comments",
            headers=headers,
            json={"comment": "let me in"},
        )
        self.assertEqual(resp.status_code, 404)

        # Complaint list stays scoped to the caller.
        resp = self.client.get("/complaints", headers=headers)
        self.assertEqual(resp.status_code, 200)
        ids = {item["id"] for item in resp.json()}
        self.assertIn(self.own_complaint, ids)
        self.assertNotIn(self.foreign_complaint, ids)

    def test_staff_cannot_delete_complaint_they_do_not_own(self):
        resp = self.client.delete(
            f"/complaints/{self.foreign_complaint}", headers=self.auth(self.staff)
        )
        self.assertEqual(resp.status_code, 404)

    def test_owner_and_admin_can_delete_their_complaints(self):
        resp = self.client.delete(
            f"/complaints/{self.own_complaint}", headers=self.auth(self.user)
        )
        self.assertEqual(resp.status_code, 200)

        resp = self.client.delete(
            f"/complaints/{self.foreign_complaint}", headers=self.auth(self.admin)
        )
        self.assertEqual(resp.status_code, 200)

    # --- Workflow endpoints ---

    def test_only_staff_and_admin_can_transition_status(self):
        resp = self.client.patch(
            f"/complaints/{self.own_complaint}/status",
            headers=self.auth(self.user),
            json={"status": "resolved"},
        )
        self.assertEqual(resp.status_code, 403)

        resp = self.client.patch(
            f"/complaints/{self.own_complaint}/status",
            headers=self.auth(self.staff),
            json={"status": "in_progress"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "in_progress")

    def test_assign_requires_staff_target(self):
        resp = self.client.patch(
            f"/complaints/{self.foreign_complaint}/assign",
            headers=self.auth(self.staff),
            json={"assigned_staff_id": self.other_user.id},
        )
        self.assertEqual(resp.status_code, 400)

        resp = self.client.patch(
            f"/complaints/{self.foreign_complaint}/assign",
            headers=self.auth(self.staff),
            json={"assigned_staff_id": self.staff.id},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["assigned_staff_id"], self.staff.id)

    # --- Internal comments ---

    def test_internal_comments_hidden_from_standard_users(self):
        headers_staff = self.auth(self.staff)

        resp = self.client.post(
            f"/complaints/{self.foreign_complaint}/comments",
            headers=headers_staff,
            json={"comment": "internal note", "is_internal": True},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.json()["is_internal"])

        # Owner of the complaint sees only public comments.
        owner_headers = self.auth(self.other_user)
        resp = self.client.get(
            f"/complaints/{self.foreign_complaint}/comments", headers=owner_headers
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

        # Staff still see the internal note.
        resp = self.client.get(
            f"/complaints/{self.foreign_complaint}/comments", headers=headers_staff
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertTrue(resp.json()[0]["is_internal"])

    def test_standard_users_cannot_create_internal_comments(self):
        resp = self.client.post(
            f"/complaints/{self.own_complaint}/comments",
            headers=self.auth(self.user),
            json={"comment": "sneaky", "is_internal": True},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(resp.json()["is_internal"])

    # --- Admin management controls ---

    def test_admin_can_manage_roles_and_users(self):
        resp = self.client.patch(
            f"/users/{self.other_user.id}/role",
            headers=self.auth(self.admin),
            json={"role": "staff"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["role"], "staff")
        self.assertEqual(self.get_user(self.other_user.id).role, "staff")

        resp = self.client.patch(
            f"/users/{self.other_user.id}/role",
            headers=self.auth(self.admin),
            json={"role": "not_a_role"},
        )
        self.assertEqual(resp.status_code, 400)

        resp = self.client.delete(
            f"/users/{self.admin.id}", headers=self.auth(self.admin)
        )
        self.assertEqual(resp.status_code, 400)

        victim = self.create_user("victim_to_delete")
        resp = self.client.delete(
            f"/users/{victim.id}", headers=self.auth(self.admin)
        )
        self.assertEqual(resp.status_code, 200)

    def test_reports_scope_by_role(self):
        # Standard user analytics only cover their own complaints.
        resp = self.client.get("/reports/analytics", headers=self.auth(self.user))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["scope"], "user")
        self.assertEqual(resp.json()["totals"]["total"], 1)

        # Staff/admin analytics cover everything.
        resp = self.client.get("/reports/analytics", headers=self.auth(self.staff))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["scope"], "staff")
        self.assertEqual(resp.json()["totals"]["total"], 2)

        resp = self.client.get("/reports/analytics", headers=self.auth(self.admin))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["scope"], "admin")
        self.assertEqual(resp.json()["totals"]["total"], 2)


if __name__ == "__main__":
    unittest.main()
