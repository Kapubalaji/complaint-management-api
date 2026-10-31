import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-phase6-hardening"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.security import hash_password
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


class TestPhase6Hardening(unittest.TestCase):
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
                username="rate_user",
                password=hash_password("Pass123!"),
                email="rate_user@example.com",
                full_name="Rate Limited User",
                role="user",
            )
            session.add(user)
            session.commit()

    def tearDown(self):
        limiter.reset()
        Base.metadata.drop_all(bind=test_engine)

    # --- Health Endpoint Tests ---

    def test_health_endpoint_healthy(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload["status"], "healthy")
        self.assertEqual(payload["database"], "connected")
        # Ensure no sensitive database metadata is leaked
        self.assertNotIn("sqlite", str(payload).lower())
        self.assertNotIn("postgresql", str(payload).lower())

    def test_root_endpoint_preserved(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertIn("ResolveIT Complaint Management API is running", payload["message"])
        self.assertEqual(payload["version"], "2.0.0")

    def test_health_endpoint_unhealthy_when_database_down(self):
        # Simulate broken database connection
        broken_engine = create_engine("sqlite:///nonexistent/path/db.sqlite")
        original_engine = db_mod.engine
        try:
            db_mod.engine = broken_engine
            resp = self.client.get("/health")
            self.assertEqual(resp.status_code, 503)
            payload = resp.json()
            self.assertEqual(payload["status"], "unhealthy")
            self.assertEqual(payload["database"], "disconnected")
            # Verify no stack trace or internal error messages are leaked
            self.assertNotIn("traceback", str(payload).lower())
            self.assertNotIn("operationalerror", str(payload).lower())
        finally:
            db_mod.engine = original_engine

    # --- Rate Limiting Tests ---

    def test_login_rate_limiting_allowed_and_rejection(self):
        # Allowed attempts: 5 requests per minute
        for i in range(5):
            resp = self.client.post(
                "/users/login",
                json={"username": "rate_user", "password": "WrongPassword"},
            )
            self.assertEqual(
                resp.status_code,
                401,
                f"Attempt {i+1} should return 401 for incorrect password, not rate limited",
            )

        # 6th attempt exceeds the limit of 5/minute and must be rejected with HTTP 429
        rejected_resp = self.client.post(
            "/users/login",
            json={"username": "rate_user", "password": "Pass123!"},
        )
        self.assertEqual(rejected_resp.status_code, 429)
        payload = rejected_resp.json()
        self.assertTrue(
            "Rate limit exceeded" in payload.get("detail", "")
            or "Rate limit exceeded" in payload.get("error", "")
        )

    def test_login_rate_limiting_does_not_trust_arbitrary_forwarded_headers(self):
        # Attacker tries to bypass rate limit by sending arbitrary/rotating X-Forwarded-For headers
        for i in range(5):
            resp = self.client.post(
                "/users/login",
                headers={"X-Forwarded-For": f"203.0.113.{i+1}"},
                json={"username": "rate_user", "password": "WrongPassword"},
            )
            self.assertEqual(resp.status_code, 401)

        # 6th attempt with yet another spoofed IP must still be blocked by client IP limiter
        blocked_resp = self.client.post(
            "/users/login",
            headers={"X-Forwarded-For": "198.51.100.99"},
            json={"username": "rate_user", "password": "Pass123!"},
        )
        self.assertEqual(
            blocked_resp.status_code,
            429,
            "Limiter must not trust arbitrary X-Forwarded-For headers to bypass limit",
        )


if __name__ == "__main__":
    unittest.main()
