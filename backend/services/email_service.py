import logging
import os
import smtplib
from email.message import EmailMessage
import httpx

logger = logging.getLogger("resolveit.email_service")


def mask_email(email: str) -> str:
    """Masks an email address for safe logging without exposing full identity."""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked_local}@{domain}"


def get_frontend_url() -> str:
    """Returns the base frontend URL, falling back to localhost if unset."""
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def send_password_reset_email(to_email: str, username: str, reset_token: str) -> bool:
    """Dispatches a password-reset email with a fragment-based reset URL.

    Security constraints:
    - Token is placed in the URL fragment (#reset_token=...), never in query params.
    - Never logs reset tokens, reset URLs, or passwords.
    - Returns False if delivery fails or is unconfigured; does not raise exceptions.
    """
    if not to_email or not reset_token:
        return False

    provider = os.getenv("EMAIL_PROVIDER", "").strip().lower()
    masked = mask_email(to_email)
    frontend_url = get_frontend_url()

    # Fragment-based reset link protects the token from server access logs and referrer leaks
    reset_url = f"{frontend_url}/#reset_token={reset_token}"

    if not provider:
        logger.debug("[email_service] EMAIL_PROVIDER is not set; skipping email dispatch to %s", masked)
        return False

    if provider == "mock":
        # Safe mock mode for testing/dev: never outputs token or reset URL
        logger.info("[email_service] [MOCK] Password reset email queued for %s (token suppressed)", masked)
        return True

    from_email = os.getenv("EMAIL_FROM", "ResolveIT Support <noreply@resolveit.org>")
    subject = "ResolveIT - Password Reset Request"
    text_content = (
        f"Hello {username},\n\n"
        f"A password reset was requested for your ResolveIT account.\n\n"
        f"To set a new password, open this secure link in your browser:\n"
        f"{reset_url}\n\n"
        f"This link will expire in 15 minutes.\n"
        f"If you did not request this reset, you can safely ignore this email.\n"
    )

    if provider == "resend":
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            logger.warning("[email_service] RESEND_API_KEY is not configured")
            return False
        try:
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "from": from_email,
                    "to": [to_email],
                    "subject": subject,
                    "text": text_content,
                },
                timeout=10.0,
            )
            if resp.status_code in (200, 201):
                logger.info("[email_service] Reset email delivered via Resend to %s", masked)
                return True
            logger.error("[email_service] Resend returned HTTP %d", resp.status_code)
            return False
        except Exception as err:
            logger.error("[email_service] Resend request failed: %s", type(err).__name__)
            return False

    if provider == "smtp":
        host = os.getenv("SMTP_HOST")
        port = int(os.getenv("SMTP_PORT", "587"))
        user = os.getenv("SMTP_USERNAME")
        password = os.getenv("SMTP_PASSWORD")
        use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

        if not host:
            logger.warning("[email_service] SMTP_HOST is not configured")
            return False

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = to_email
        msg.set_content(text_content)

        try:
            if port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=10.0)
            else:
                server = smtplib.SMTP(host, port, timeout=10.0)
                if use_tls:
                    server.starttls()

            if user and password:
                server.login(user, password)

            server.send_message(msg)
            server.quit()
            logger.info("[email_service] Reset email sent via SMTP to %s", masked)
            return True
        except Exception as err:
            logger.error("[email_service] SMTP dispatch failed: %s", type(err).__name__)
            return False

    logger.warning("[email_service] Unsupported EMAIL_PROVIDER: '%s'", provider)
    return False
