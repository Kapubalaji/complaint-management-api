import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase3-tests"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.models.complaint import Complaint
from backend.security import hash_password, create_access_token
from backend.services.ai_service import (
    analyze_complaint_with_ai,
    fallback_heuristic_analysis,
    ALLOWED_CATEGORIES,
    ALLOWED_PRIORITIES,
    ALLOWED_SENTIMENTS,
)

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestPhase3AIEngine(unittest.TestCase):

    def setUp(self):
        Base.metadata.create_all(bind=test_engine)

        import backend.database as db_mod
        import backend.routers.users as users_router
        import backend.routers.complaints as complaints_router
        import backend.routers.ai as ai_router
        import backend.security as sec_mod

        db_mod.engine = test_engine
        users_router.engine = test_engine
        complaints_router.engine = test_engine
        ai_router.engine = test_engine
        sec_mod.engine = test_engine

        # Deterministic rule-engine fallback during tests
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
            role=role
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.close()
        return user

    def auth(self, user) -> dict:
        token = create_access_token(user.username, role=user.role)
        return {"Authorization": f"Bearer {token}"}

    # --- Scenario: auto-triage on complaint creation ---

    def test_create_complaint_populates_ai_fields(self):
        user = self.create_user("reporter", role="user")
        staff = self.create_user("it_support", role="staff")

        res = self.client.post(
            "/complaints",
            json={
                "title": "Server completely down",
                "description": "The database server crashed and the network is unreachable. Critical outage."
            },
            headers=self.auth(user)
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()

        self.assertIn(data["category"], ALLOWED_CATEGORIES)
        self.assertIn(data["priority"], ALLOWED_PRIORITIES)
        self.assertIn(data["sentiment"], ALLOWED_SENTIMENTS)
        self.assertIsNotNone(data["ai_summary"])
        self.assertTrue(len(data["ai_summary"]) > 0)
        self.assertEqual(data["suggested_staff_id"], staff.id)
        self.assertEqual(data["status"], "open")

    def test_ai_defaults_not_applied_when_user_provides_values(self):
        user = self.create_user("picky", role="user")
        self.create_user("it_support", role="staff")

        res = self.client.post(
            "/complaints",
            json={
                "title": "Server completely down",
                "description": "Critical outage, system crash.",
                "category": "General",
                "priority": "Low"
            },
            headers=self.auth(user)
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()

        # User-provided values win over AI-generated defaults
        self.assertEqual(data["category"], "General")
        self.assertEqual(data["priority"], "Low")
        # AI analysis fields are still populated
        self.assertIsNotNone(data["sentiment"])
        self.assertIsNotNone(data["ai_summary"])

    # --- Scenario: /ai/preview endpoint ---

    def test_ai_preview_returns_analysis_result(self):
        user = self.create_user("previewer", role="user")

        res = self.client.post(
            "/ai/preview",
            params={
                "title": "Cannot login to email",
                "description": "Password reset fails, login page shows an error."
            },
            headers=self.auth(user)
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn(data["category"], ALLOWED_CATEGORIES)
        self.assertIn(data["sentiment"], ALLOWED_SENTIMENTS)
        self.assertIn(data["priority"], ALLOWED_PRIORITIES)
        self.assertIn(
            data["provider_used"],
            ["openai", "anthropic", "rule_engine_fallback"]
        )
        self.assertEqual(data["provider_used"], "rule_engine_fallback")

    def test_ai_preview_requires_authentication(self):
        res = self.client.post(
            "/ai/preview",
            params={"title": "x", "description": "y"}
        )
        self.assertIn(res.status_code, [401, 403])

    # --- Scenario: /complaints/{id}/reanalyze endpoint ---

    def test_reanalyze_refreshes_ai_fields(self):
        user = self.create_user("reanalyzer", role="user")
        self.create_user("it_support", role="staff")

        res = self.client.post(
            "/complaints",
            json={
                "title": "General question",
                "description": "Just a question.",
                "category": "General",
                "priority": "Low"
            },
            headers=self.auth(user)
        )
        cid = res.json()["id"]

        # Change the complaint content so reanalysis must produce new AI values
        patch_res = self.client.patch(
            f"/complaints/{cid}",
            json={
                "title": "Workplace harassment complaint",
                "description": "My manager keeps harassing me and violating HR policy."
            },
            headers=self.auth(user)
        )
        self.assertEqual(patch_res.status_code, 200)
        # Owner manually set fields remain until reanalysis
        self.assertEqual(patch_res.json()["category"], "General")

        reanalyze = self.client.post(
            f"/complaints/{cid}/reanalyze",
            headers=self.auth(user)
        )
        self.assertEqual(reanalyze.status_code, 200)
        data = reanalyze.json()
        self.assertEqual(data["category"], "Human Resources")
        self.assertIn(data["priority"], ALLOWED_PRIORITIES)
        self.assertIsNotNone(data["ai_summary"])
        self.assertIsNotNone(data["suggested_staff_id"])

    def test_reanalyze_denied_for_non_owner_standard_user(self):
        owner = self.create_user("owner", role="user")
        other = self.create_user("stranger", role="user")
        self.create_user("it_support", role="staff")

        res = self.client.post(
            "/complaints",
            json={"title": "Private issue", "description": "Not yours."},
            headers=self.auth(owner)
        )
        cid = res.json()["id"]

        reanalyze = self.client.post(
            f"/complaints/{cid}/reanalyze",
            headers=self.auth(other)
        )
        self.assertEqual(reanalyze.status_code, 404)

    def test_reanalyze_allowed_for_assigned_staff(self):
        user = self.create_user("owner", role="user")
        staff = self.create_user("agent", role="staff")
        admin = self.create_user("boss", role="admin")

        res = self.client.post(
            "/complaints",
            json={"title": "Wi-Fi down", "description": "Internet not working in Building B."},
            headers=self.auth(user)
        )
        cid = res.json()["id"]

        # Admin assigns first
        assign = self.client.patch(
            f"/complaints/{cid}/assign",
            headers=self.auth(admin),
            json={"assigned_staff_id": staff.id},
        )
        self.assertEqual(assign.status_code, 200)

        reanalyze = self.client.post(
            f"/complaints/{cid}/reanalyze",
            headers=self.auth(staff)
        )
        self.assertEqual(reanalyze.status_code, 200)
        self.assertEqual(reanalyze.json()["category"], "IT & Systems")

    def test_reanalyze_denied_for_unassigned_staff(self):
        user = self.create_user("owner2", role="user")
        staff = self.create_user("agent2", role="staff")
        other_staff = self.create_user("agent3", role="staff")

        res = self.client.post(
            "/complaints",
            json={"title": "Projector broken", "description": "Lamp failure in hall."},
            headers=self.auth(user)
        )
        cid = res.json()["id"]

        # Unassigned staff cannot reanalyze
        reanalyze = self.client.post(
            f"/complaints/{cid}/reanalyze",
            headers=self.auth(staff)
        )
        self.assertEqual(reanalyze.status_code, 404)

        # Even after assignment to another staff, this staff cannot reanalyze
        session = TestingSessionLocal()
        complaint = session.get(Complaint, cid)
        complaint.assigned_staff_id = other_staff.id
        session.commit()
        session.close()

        reanalyze = self.client.post(
            f"/complaints/{cid}/reanalyze",
            headers=self.auth(staff)
        )
        self.assertEqual(reanalyze.status_code, 404)

    # --- Scenario: provider failure falls back to rule engine ---

    def test_provider_failure_falls_back_to_rule_engine(self):
        import backend.services.ai_service as ai_service_mod

        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-fake-key"}):
            with patch.object(
                ai_service_mod.httpx, "Client",
                side_effect=Exception("simulated provider outage")
            ):
                result = analyze_complaint_with_ai(
                    "Server down",
                    "The server crashed during production release.",
                    [{"id": 1, "username": "it_support", "full_name": "IT Support", "active_count": 0}]
                )

        self.assertEqual(result.provider_used, "rule_engine_fallback")
        self.assertIn(result.category, ALLOWED_CATEGORIES)
        self.assertIn(result.priority, ALLOWED_PRIORITIES)
        self.assertIn(result.sentiment, ALLOWED_SENTIMENTS)
        self.assertTrue(result.ai_summary)

    def test_no_api_key_uses_rule_engine_directly(self):
        result = analyze_complaint_with_ai("Refund not received", "I need my money back.")
        self.assertEqual(result.provider_used, "rule_engine_fallback")
        self.assertEqual(result.category, "Billing & Finance")

    # --- Rule engine unit checks ---

    def test_rule_engine_urgent_sentiment_and_priority(self):
        result = fallback_heuristic_analysis(
            "Electrical fire hazard",
            "Smoke everywhere, the power outlet is dangerous. I am furious and this is outrageous."
        )
        self.assertEqual(result.sentiment, "Escalated")
        self.assertEqual(result.priority, "Urgent")
        self.assertEqual(result.category, "Facilities & Maintenance")

    def test_rule_engine_picks_lowest_workload_staff(self):
        staff = [
            {"id": 10, "username": "busy_agent", "full_name": "Busy Agent", "active_count": 9},
            {"id": 11, "username": "free_agent", "full_name": "Free Agent", "active_count": 1},
        ]
        result = fallback_heuristic_analysis("Some odd request", "Unclassifiable text.", staff)
        self.assertEqual(result.suggested_staff_id, 11)

    def test_complaint_stores_ai_columns(self):
        user = self.create_user("storER", role="user")
        self.create_user("it_support", role="staff")
        res = self.client.post(
            "/complaints",
            json={"title": "Laptop broken", "description": "Keyboard not working at all."},
            headers=self.auth(user)
        )
        cid = res.json()["id"]

        session = TestingSessionLocal()
        complaint = session.query(Complaint).filter(Complaint.id == cid).first()
        session.close()

        self.assertIsNotNone(complaint.sentiment)
        self.assertIsNotNone(complaint.ai_summary)
        self.assertIsNotNone(complaint.suggested_staff_id)
        self.assertEqual(complaint.category, "IT & Systems")


if __name__ == "__main__":
    unittest.main()
