import os
import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-password-reset-tests-999"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.security import (
    hash_password,
    create_password_reset_token,
    create_access_token,
)
from backend.limiter import limiter
from backend.services.email_service import mask_email, send_password_reset_email
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


class TestPhase6PasswordReset(unittest.TestCase):
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
            user_alice = User(
                username="alice_reset",
                password=hash_password("AliceInitialPass123!"),
                email="alice_reset@example.com",
                full_name="Alice Reset",
                role="user",
            )
            user_bob = User(
                username="bob_reset",
                password=hash_password("BobInitialPass123!"),
                email="bob_reset@example.com",
                full_name="Bob Reset",
                role="user",
            )
            session.add_all([user_alice, user_bob])
            session.commit()

    def tearDown(self):
        limiter.reset()
        Base.metadata.drop_all(bind=test_engine)

    def test_forgot_password_generic_response_for_existing_and_nonexistent_users(self):
        # Existing user
        resp_existing = self.client.post(
            "/users/forgot-password",
            json={"username": "alice_reset", "email": "alice_reset@example.com"},
        )
        self.assertEqual(resp_existing.status_code, 200)
        data_existing = resp_existing.json()
        self.assertNotIn("token", data_existing)
        self.assertNotIn("reset_token", data_existing)
        self.assertNotIn("password", data_existing)

        # Nonexistent user
        resp_unknown = self.client.post(
            "/users/forgot-password",
            json={"username": "non_existent_user_xyz"},
        )
        self.assertEqual(resp_unknown.status_code, 200)
        data_unknown = resp_unknown.json()
        self.assertNotIn("token", data_unknown)
        self.assertNotIn("reset_token", data_unknown)

        # Responses must be identical to prevent user enumeration
        self.assertEqual(data_existing["message"], data_unknown["message"])

    def test_forgot_password_rate_limiting(self):
        for i in range(5):
            resp = self.client.post(
                "/users/forgot-password",
                json={"username": f"user_attempt_{i}"},
            )
            self.assertEqual(resp.status_code, 200, f"Attempt {i+1} should succeed")

        # 6th attempt must be rejected with HTTP 429
        blocked = self.client.post(
            "/users/forgot-password",
            json={"username": "user_attempt_blocked"},
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertTrue(
            "Rate limit exceeded" in blocked.json().get("detail", "")
            or "Rate limit exceeded" in blocked.json().get("error", "")
        )

    def test_reset_password_rate_limiting(self):
        for i in range(5):
            resp = self.client.post(
                "/users/reset-password",
                json={"token": "invalid_token", "new_password": "NewSecretPass123!"},
            )
            self.assertEqual(resp.status_code, 400, f"Attempt {i+1} should return 400")

        # 6th attempt must be rejected with HTTP 429
        blocked = self.client.post(
            "/users/reset-password",
            json={"token": "invalid_token", "new_password": "NewSecretPass123!"},
        )
        self.assertEqual(blocked.status_code, 429)

    def test_reset_password_with_valid_token_success(self):
        token = create_password_reset_token("alice_reset")

        reset_resp = self.client.post(
            "/users/reset-password",
            json={"token": token, "new_password": "AliceNewPassword456!"},
        )
        self.assertEqual(reset_resp.status_code, 200)
        self.assertIn("successfully reset", reset_resp.json()["message"])

        # Old password no longer works
        old_login = self.client.post(
            "/users/login",
            json={"username": "alice_reset", "password": "AliceInitialPass123!"},
        )
        self.assertEqual(old_login.status_code, 401)

        # New password works
        new_login = self.client.post(
            "/users/login",
            json={"username": "alice_reset", "password": "AliceNewPassword456!"},
        )
        self.assertEqual(new_login.status_code, 200)
        self.assertIn("access_token", new_login.json())

    def test_reset_token_invalidated_after_password_change(self):
        # Generate token while password is Pass123!
        token = create_password_reset_token("alice_reset")

        # First reset succeeds
        first_reset = self.client.post(
            "/users/reset-password",
            json={"token": token, "new_password": "PasswordVersion2!"},
        )
        self.assertEqual(first_reset.status_code, 200)

        # Second attempt with the SAME token must be rejected because password hash changed
        second_reset = self.client.post(
            "/users/reset-password",
            json={"token": token, "new_password": "PasswordVersion3!"},
        )
        self.assertEqual(second_reset.status_code, 400)
        self.assertIn("Invalid or expired reset token", second_reset.json()["detail"])

    def test_token_cannot_be_used_by_another_account(self):
        # Alice generates a token
        alice_token = create_password_reset_token("alice_reset")

        # Alice's token is bound to "alice_reset"; it cannot reset Bob
        # Token execution only operates on 'sub' (alice_reset)
        reset_resp = self.client.post(
            "/users/reset-password",
            json={"token": alice_token, "new_password": "AttemptReset!"},
        )
        self.assertEqual(reset_resp.status_code, 200)

        # Verify Bob's password was completely untouched
        bob_login = self.client.post(
            "/users/login",
            json={"username": "bob_reset", "password": "BobInitialPass123!"},
        )
        self.assertEqual(bob_login.status_code, 200)

    def test_tampered_or_invalid_tokens_rejected(self):
        # Garbage string
        resp1 = self.client.post(
            "/users/reset-password",
            json={"token": "not.a.valid.jwt", "new_password": "Pass123!"},
        )
        self.assertEqual(resp1.status_code, 400)

        # Access token used as reset token
        access_tok = create_access_token("alice_reset")
        resp2 = self.client.post(
            "/users/reset-password",
            json={"token": access_tok, "new_password": "Pass123!"},
        )
        self.assertEqual(resp2.status_code, 400)
        self.assertIn("Invalid token type", resp2.json()["detail"])

    def test_missing_email_configuration_never_exposes_token(self):
        # Ensure EMAIL_PROVIDER is unset
        old_val = os.environ.pop("EMAIL_PROVIDER", None)
        try:
            resp = self.client.post(
                "/users/forgot-password",
                json={"username": "alice_reset", "email": "alice_reset@example.com"},
            )
            self.assertEqual(resp.status_code, 200)
            self.assertNotIn("token", resp.json())
        finally:
            if old_val:
                os.environ["EMAIL_PROVIDER"] = old_val

    def test_email_delivery_failure_does_not_expose_sensitive_information(self):
        # Set EMAIL_PROVIDER to an invalid provider
        os.environ["EMAIL_PROVIDER"] = "resend"
        os.environ["RESEND_API_KEY"] = "invalid-key-simulating-network-failure"
        try:
            resp = self.client.post(
                "/users/forgot-password",
                json={"username": "alice_reset", "email": "alice_reset@example.com"},
            )
            self.assertEqual(resp.status_code, 200)
            # Response must still be generic and never leak failure stack trace
            self.assertIn("If an account matches those details", resp.json()["message"])
            self.assertNotIn("resend", str(resp.json()).lower())
        finally:
            os.environ.pop("EMAIL_PROVIDER", None)
            os.environ.pop("RESEND_API_KEY", None)

    def test_email_masking_helper(self):
        self.assertEqual(mask_email("john.doe@example.com"), "j******e@example.com")
        self.assertEqual(mask_email("ab@test.org"), "a*@test.org")
        self.assertEqual(mask_email("invalid-email"), "***")


if __name__ == "__main__":
    unittest.main()
