from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "noreply@example.com")


async def send_otp_email(to_email: str, code: str) -> None:
    if not _RESEND_API_KEY:
        # Local dev: print code so you can log in without an email service
        logger.warning("RESEND_API_KEY not set — OTP for %s: %s", to_email, code)
        return

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {_RESEND_API_KEY}"},
            json={
                "from": _FROM_EMAIL,
                "to": [to_email],
                "subject": "Your login code",
                "html": (
                    f"<p>Your login code for Not Now:</p>"
                    f"<p style='font-size:32px;font-weight:bold;letter-spacing:8px'>{code}</p>"
                    f"<p>This code expires in 10 minutes. If you didn't request this, ignore this email.</p>"
                ),
            },
            timeout=10,
        )
        response.raise_for_status()
