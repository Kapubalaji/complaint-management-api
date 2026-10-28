import csv
import io
import os
import unittest
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase5-analytics-tests"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.models.complaint import Complaint
from backend.security import hash_password, create_access_token

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestPhase5Analytics(unittest.TestCase):

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
        session.close()
        return user

    def auth(self, user) -> dict:
        token = create_access_token(user.username, role=user.role)
        return {"Authorization": f"Bearer {token}"}

    def add_complaint(
        self,
        owner_id: int,
        status: str = "open",
        category: str = "General",
        priority: str = "Medium",
        assigned_staff_id: int | None = None,
        created_at: datetime | None = None,
        resolved_at: datetime | None = None,
        title: str = "Sample complaint",
    ) -> Complaint:
        session = TestingSessionLocal()
        complaint = Complaint(
            title=title,
            description="Detailed description for testing.",
            status=status,
            category=category,
            priority=priority,
            sentiment="Neutral",
            user_id=owner_id,
            assigned_staff_id=assigned_staff_id,
            created_at=created_at or datetime.now(timezone.utc),
            resolved_at=resolved_at,
        )
        session.add(complaint)
        session.commit()
        session.refresh(complaint)
        complaint_id = complaint.id
        session.close()
        session = TestingSessionLocal()
        complaint = session.get(Complaint, complaint_id)
        session.close()
        return complaint

    # --- Analytics computed from real rows ---

    def test_analytics_totals_status_category_priority(self):
        owner = self.create_user("ana")
        staff = self.create_user("sam", role="staff")

        self.add_complaint(owner.id, status="open", category="IT & Systems", priority="Urgent")
        self.add_complaint(owner.id, status="in_progress", category="Billing & Finance", priority="Low")
        self.add_complaint(
            owner.id,
            status="resolved",
            category="IT & Systems",
            priority="Medium",
            assigned_staff_id=staff.id,
            resolved_at=datetime.now(timezone.utc),
        )
        # Another user's complaint must not leak into a standard user's scope
        other = self.create_user("other")
        self.add_complaint(other.id, status="closed", category="General", priority="High")

        user_resp = self.client.get("/reports/analytics", headers=self.auth(owner))
        self.assertEqual(user_resp.status_code, 200)
        payload = user_resp.json()

        self.assertEqual(payload["scope"], "user")
        self.assertEqual(payload["totals"]["total"], 3)
        self.assertEqual(payload["totals"]["open"], 1)
        self.assertEqual(payload["totals"]["in_progress"], 1)
        self.assertEqual(payload["totals"]["resolved"], 1)
        self.assertEqual(payload["totals"]["closed"], 0)
        self.assertEqual(payload["by_category"]["IT & Systems"], 2)
        self.assertEqual(payload["by_category"]["Billing & Finance"], 1)
        self.assertEqual(payload["by_priority"]["Urgent"], 1)
        self.assertEqual(payload["by_priority"]["Low"], 1)
        self.assertEqual(payload["by_priority"]["Medium"], 1)
        self.assertEqual(payload["by_priority"]["High"], 0)
        self.assertEqual(payload["resolution"]["resolved_count"], 1)
        self.assertEqual(payload["resolution"]["total_count"], 3)

        admin_resp = self.client.get("/reports/analytics", headers=self.auth(staff))
        self.assertEqual(admin_resp.status_code, 200)
        staff_payload = admin_resp.json()
        self.assertEqual(staff_payload["scope"], "staff")
        self.assertEqual(staff_payload["totals"]["total"], 4)
        self.assertEqual(staff_payload["totals"]["closed"], 1)

    def test_analytics_resolution_stats_and_trend(self):
        owner = self.create_user("trend_owner")
        now = datetime.now(timezone.utc)

        self.add_complaint(
            owner.id,
            status="resolved",
            created_at=now - timedelta(hours=6),
            resolved_at=now,
        )
        self.add_complaint(
            owner.id,
            status="open",
            created_at=now,
        )

        resp = self.client.get("/reports/analytics", headers=self.auth(owner))
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()

        resolution = payload["resolution"]
        self.assertEqual(resolution["resolved_count"], 1)
        self.assertEqual(resolution["total_count"], 2)
        self.assertAlmostEqual(resolution["resolution_rate"], 0.5, places=4)
        self.assertIsNotNone(resolution["avg_resolution_hours"])
        self.assertAlmostEqual(resolution["avg_resolution_hours"], 6.0, delta=0.5)

        trend = payload["trend"]
        self.assertEqual(len(trend), 30)
        today = now.date().isoformat()
        last_point = trend[-1]
        self.assertEqual(last_point["date"], today)
        self.assertEqual(last_point["created"], 2)
        self.assertEqual(last_point["resolved"], 1)
        self.assertEqual(sum(point["created"] for point in trend), 2)
        self.assertEqual(sum(point["resolved"] for point in trend), 1)

    def test_analytics_staff_workload_breakdown(self):
        admin = self.create_user("boss", role="admin")
        staff_a = self.create_user("worker_a", role="staff")
        staff_b = self.create_user("worker_b", role="staff")
        citizen = self.create_user("citizen")

        self.add_complaint(citizen.id, status="open", assigned_staff_id=staff_a.id)
        self.add_complaint(citizen.id, status="in_progress", assigned_staff_id=staff_a.id)
        self.add_complaint(
            citizen.id,
            status="resolved",
            assigned_staff_id=staff_a.id,
            resolved_at=datetime.now(timezone.utc),
        )
        self.add_complaint(citizen.id, status="open", assigned_staff_id=staff_b.id)
        self.add_complaint(citizen.id, status="open")  # unassigned

        resp = self.client.get("/reports/analytics", headers=self.auth(admin))
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()

        self.assertEqual(payload["scope"], "admin")
        self.assertEqual(payload["totals"]["unassigned"], 1)

        workload = {row["username"]: row for row in payload["staff_workload"]}
        self.assertIn("worker_a", workload)
        self.assertIn("worker_b", workload)
        self.assertIn("boss", workload)
        self.assertEqual(workload["worker_a"]["active_count"], 2)
        self.assertEqual(workload["worker_a"]["total_count"], 3)
        self.assertEqual(workload["worker_a"]["resolved_count"], 1)
        self.assertEqual(workload["worker_b"]["active_count"], 1)
        self.assertEqual(workload["worker_b"]["total_count"], 1)
        self.assertEqual(workload["boss"]["total_count"], 0)

        mine = payload["my_workload"]
        self.assertIsNotNone(mine)
        self.assertEqual(mine["total_count"], 0)

    def test_analytics_my_workload_for_staff(self):
        staff = self.create_user("solo", role="staff")
        citizen = self.create_user("client")

        self.add_complaint(citizen.id, status="open", assigned_staff_id=staff.id)
        self.add_complaint(
            citizen.id,
            status="closed",
            assigned_staff_id=staff.id,
            resolved_at=datetime.now(timezone.utc),
        )

        resp = self.client.get("/reports/analytics", headers=self.auth(staff))
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload["scope"], "staff")
        self.assertEqual(payload["my_workload"]["active_count"], 1)
        self.assertEqual(payload["my_workload"]["total_count"], 2)
        self.assertEqual(payload["my_workload"]["resolved_count"], 1)

    def test_analytics_requires_authentication(self):
        resp = self.client.get("/reports/analytics")
        self.assertEqual(resp.status_code, 401)

        bad = self.client.get(
            "/reports/analytics", headers={"Authorization": "Bearer not-a-token"}
        )
        self.assertEqual(bad.status_code, 401)

    # --- CSV report export ---

    def test_csv_export_headers_and_content(self):
        owner = self.create_user("csv_owner")
        self.add_complaint(owner.id, status="open", category="IT & Systems", priority="Urgent")

        resp = self.client.get("/reports/export", headers=self.auth(owner))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp.headers["content-type"])
        self.assertIn("attachment; filename=", resp.headers["content-disposition"])

        rows = list(csv.reader(io.StringIO(resp.text)))
        self.assertEqual(
            rows[0],
            [
                "id",
                "title",
                "status",
                "category",
                "priority",
                "sentiment",
                "user_id",
                "assigned_staff_id",
                "created_at",
                "resolved_at",
            ],
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][2], "open")
        self.assertEqual(rows[1][3], "IT & Systems")
        self.assertEqual(rows[1][4], "Urgent")
        self.assertEqual(int(rows[1][6]), owner.id)

    def test_csv_export_is_role_scoped(self):
        owner = self.create_user("scope_owner")
        other = self.create_user("scope_other")
        admin = self.create_user("scope_admin", role="admin")

        self.add_complaint(owner.id, title="Mine")
        self.add_complaint(other.id, title="Theirs")

        user_rows = list(
            csv.reader(
                io.StringIO(
                    self.client.get(
                        "/reports/export", headers=self.auth(owner)
                    ).text
                )
            )
        )
        self.assertEqual(len(user_rows) - 1, 1)
        self.assertIn("Mine", user_rows[1][1])

        admin_rows = list(
            csv.reader(
                io.StringIO(
                    self.client.get(
                        "/reports/export", headers=self.auth(admin)
                    ).text
                )
            )
        )
        self.assertEqual(len(admin_rows) - 1, 2)
        titles = {row[1] for row in admin_rows[1:]}
        self.assertEqual(titles, {"Mine", "Theirs"})

    def test_csv_export_requires_authentication(self):
        resp = self.client.get("/reports/export")
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
