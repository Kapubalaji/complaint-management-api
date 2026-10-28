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
os.environ["SECRET_KEY"] = "test-secret-key-for-phase5-export-range-tests"

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

BASE_DAY = datetime(2026, 3, 10, 12, 0, 0, tzinfo=timezone.utc)


class TestPhase5CsvExportRange(unittest.TestCase):

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

    def add_complaint(self, owner_id: int, title: str, created_at: datetime) -> None:
        session = TestingSessionLocal()
        session.add(
            Complaint(
                title=title,
                description="Detailed description for testing.",
                status="open",
                category="General",
                priority="Medium",
                sentiment="Neutral",
                user_id=owner_id,
                created_at=created_at,
            )
        )
        session.commit()
        session.close()

    def export_rows(self, user, params: dict | None = None):
        resp = self.client.get(
            "/reports/export", params=params or {}, headers=self.auth(user)
        )
        return resp, list(csv.reader(io.StringIO(resp.text)))

    # --- Date-range filtering ---

    def test_csv_export_filters_by_date_range(self):
        owner = self.create_user("range_owner")
        self.add_complaint(owner.id, "too-old", BASE_DAY - timedelta(days=10))
        self.add_complaint(owner.id, "in-range-a", BASE_DAY - timedelta(days=3))
        self.add_complaint(owner.id, "in-range-b", BASE_DAY)

        resp, rows = self.export_rows(
            owner,
            {
                "start_date": (BASE_DAY - timedelta(days=4)).strftime("%Y-%m-%d"),
                "end_date": BASE_DAY.strftime("%Y-%m-%d"),
            },
        )
        self.assertEqual(resp.status_code, 200)
        titles = {row[1] for row in rows[1:]}
        self.assertEqual(titles, {"in-range-a", "in-range-b"})

    def test_csv_export_start_only_and_end_only(self):
        owner = self.create_user("range_edges")
        self.add_complaint(owner.id, "before", BASE_DAY - timedelta(days=9))
        self.add_complaint(owner.id, "middle", BASE_DAY - timedelta(days=3))
        self.add_complaint(owner.id, "after", BASE_DAY + timedelta(days=2))

        _, start_rows = self.export_rows(
            owner, {"start_date": (BASE_DAY - timedelta(days=5)).strftime("%Y-%m-%d")}
        )
        self.assertEqual({row[1] for row in start_rows[1:]}, {"middle", "after"})

        _, end_rows = self.export_rows(
            owner, {"end_date": (BASE_DAY - timedelta(days=5)).strftime("%Y-%m-%d")}
        )
        self.assertEqual({row[1] for row in end_rows[1:]}, {"before"})

    def test_csv_export_range_boundaries_are_inclusive(self):
        owner = self.create_user("range_inclusive")
        start_day = datetime(2026, 3, 1, 0, 0, 30, tzinfo=timezone.utc)
        end_day = datetime(2026, 3, 5, 23, 30, 0, tzinfo=timezone.utc)
        self.add_complaint(owner.id, "first-second", start_day)
        self.add_complaint(owner.id, "last-minute", end_day)
        self.add_complaint(
            owner.id, "just-before", datetime(2026, 2, 28, 23, 59, 59, tzinfo=timezone.utc)
        )
        self.add_complaint(
            owner.id, "just-after", datetime(2026, 3, 6, 0, 0, 1, tzinfo=timezone.utc)
        )

        _, rows = self.export_rows(
            owner, {"start_date": "2026-03-01", "end_date": "2026-03-05"}
        )
        self.assertEqual({row[1] for row in rows[1:]}, {"first-second", "last-minute"})

    def test_csv_export_without_dates_returns_everything(self):
        owner = self.create_user("range_default")
        self.add_complaint(owner.id, "old", BASE_DAY - timedelta(days=400))
        self.add_complaint(owner.id, "new", BASE_DAY)

        _, rows = self.export_rows(owner)
        self.assertEqual({row[1] for row in rows[1:]}, {"old", "new"})

    # --- Validation ---

    def test_csv_export_rejects_malformed_dates(self):
        owner = self.create_user("range_bad_dates")

        bad_start = self.client.get(
            "/reports/export",
            params={"start_date": "not-a-date"},
            headers=self.auth(owner),
        )
        self.assertEqual(bad_start.status_code, 422)
        self.assertIn("start_date", bad_start.json()["detail"])

        bad_format = self.client.get(
            "/reports/export",
            params={"end_date": "03/10/2026"},
            headers=self.auth(owner),
        )
        self.assertEqual(bad_format.status_code, 422)
        self.assertIn("end_date", bad_format.json()["detail"])

    def test_csv_export_rejects_inverted_range(self):
        owner = self.create_user("range_inverted")
        resp = self.client.get(
            "/reports/export",
            params={"start_date": "2026-03-10", "end_date": "2026-03-01"},
            headers=self.auth(owner),
        )
        self.assertEqual(resp.status_code, 422)
        self.assertIn("start_date must be on or before end_date", resp.json()["detail"])

    # --- Role scoping still applies with a range ---

    def test_csv_export_range_respects_role_scope(self):
        owner = self.create_user("range_scoped_owner")
        other = self.create_user("range_scoped_other")
        admin = self.create_user("range_scoped_admin", role="admin")

        self.add_complaint(owner.id, "Mine", BASE_DAY)
        self.add_complaint(other.id, "Theirs", BASE_DAY)
        self.add_complaint(owner.id, "Mine-old", BASE_DAY - timedelta(days=30))

        params = {"start_date": BASE_DAY.strftime("%Y-%m-%d")}

        _, user_rows = self.export_rows(owner, params)
        self.assertEqual({row[1] for row in user_rows[1:]}, {"Mine"})

        _, admin_rows = self.export_rows(admin, params)
        self.assertEqual({row[1] for row in admin_rows[1:]}, {"Mine", "Theirs"})

    def test_csv_export_range_requires_authentication(self):
        resp = self.client.get(
            "/reports/export", params={"start_date": "2026-03-01"}
        )
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
