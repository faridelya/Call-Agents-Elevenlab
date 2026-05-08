"""Twilio REST client — calls, SMS, phone numbers."""
import logging
import uuid
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)


class _TwilioTransientError(Exception):
    """Raised for Twilio 5xx so tenacity can retry without affecting 4xx paths."""


def _parse_twilio_error(r: httpx.Response) -> tuple[str, int | None]:
    try:
        data = r.json()
        return data.get("message", r.text), data.get("code")
    except Exception:
        return r.text, None


class TwilioService:
    def __init__(self, account_sid: str = "", auth_token: str = ""):
        self.account_sid = account_sid or settings.twilio_account_sid
        self.auth_token = auth_token or settings.twilio_auth_token
        self._base = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}"

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        async with httpx.AsyncClient(
            auth=(self.account_sid, self.auth_token),
            timeout=httpx.Timeout(15.0),
        ) as client:
            return await client.request(method, url, **kwargs)

    def _url(self, path: str) -> str:
        return f"{self._base}/{path}"

    # Human-readable explanations for common Twilio error codes
    _ERROR_HINTS: dict[int, str] = {
        20003: "Authentication failed — your Twilio account may be suspended (zero balance) or the Auth Token is incorrect. Check console.twilio.com → Account → Balance and verify your Auth Token in Settings.",
        20404: "Twilio account not found — check your Account SID in Settings.",
        21211: "Invalid destination number — use E.164 format, e.g. +923038532424.",
        21212: "Invalid 'From' number — the outbound phone number is not on your Twilio account.",
        21214: "Trial account restriction — you can only call numbers verified in the Twilio console. Verify the number or upgrade your account.",
        21215: "International calling not enabled — enable Pakistan (or the destination country) in Twilio Console → Voice → Settings → Geographic Permissions.",
        21216: "Twilio account is not authorized to call this number.",
        21606: "From number is not a valid Twilio number on your account.",
        30006: "Destination number is unreachable or is a landline with no voice capability.",
    }

    def _check(self, r: httpx.Response, context: str) -> None:
        """Raise on non-2xx. 5xx raises _TwilioTransientError (retryable); 4xx raises ExternalServiceError (not retried)."""
        if r.status_code in (200, 201, 204):
            return
        message, code = _parse_twilio_error(r)
        if r.status_code >= 500:
            logger.warning("twilio_transient context=%s http=%s twilio_code=%s", context, r.status_code, code)
            raise _TwilioTransientError(f"[{context}] {message} (HTTP {r.status_code})")
        hint = self._ERROR_HINTS.get(code or 0, "")
        human = hint if hint else f"[{context}] {message} (HTTP {r.status_code})"
        logger.error("twilio_error context=%s http=%s twilio_code=%s message=%s", context, r.status_code, code, message)
        raise ExternalServiceError("Twilio", human)

    # ── Public API ────────────────────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((httpx.RequestError, _TwilioTransientError)),
        reraise=True,
    )
    async def _create_call_inner(self, data: dict[str, Any], idempotency_key: str) -> dict:
        r = await self._request(
            "POST",
            self._url("Calls.json"),
            data=data,
            headers={"Idempotency-Key": idempotency_key},
        )
        self._check(r, "create_call")
        return r.json()

    async def create_call(
        self, to: str, from_: str, twiml_url: str, status_callback: str | None = None
    ) -> dict:
        data: dict[str, Any] = {"To": to, "From": from_, "Url": twiml_url}
        if status_callback:
            data["StatusCallback"] = status_callback
            data["StatusCallbackEvent"] = "initiated ringing answered completed"
            data["StatusCallbackMethod"] = "POST"
        idempotency_key = str(uuid.uuid4())
        logger.info("twilio_create_call to=%s from=%s idempotency=%s", to, from_, idempotency_key)
        try:
            return await self._create_call_inner(data, idempotency_key)
        except _TwilioTransientError as e:
            raise ExternalServiceError("Twilio", str(e)) from e

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=3),
        retry=retry_if_exception_type((httpx.RequestError, _TwilioTransientError)),
        reraise=True,
    )
    async def _end_call_inner(self, call_sid: str) -> None:
        r = await self._request("POST", self._url(f"Calls/{call_sid}.json"), data={"Status": "completed"})
        self._check(r, "end_call")

    async def end_call(self, call_sid: str) -> None:
        logger.info("twilio_end_call sid=%s", call_sid)
        try:
            await self._end_call_inner(call_sid)
        except _TwilioTransientError as e:
            raise ExternalServiceError("Twilio", str(e)) from e

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((httpx.RequestError, _TwilioTransientError)),
        reraise=True,
    )
    async def _redirect_call_inner(self, call_sid: str, twiml: str) -> dict:
        r = await self._request(
            "POST",
            self._url(f"Calls/{call_sid}.json"),
            data={"Twiml": twiml},
        )
        self._check(r, "redirect_call")
        return r.json()

    async def redirect_call(self, call_sid: str, twiml: str) -> dict:
        """Redirect a live Twilio call to new inline TwiML. Retries on transient network errors."""
        logger.info("twilio_redirect_call sid=%s", call_sid)
        try:
            return await self._redirect_call_inner(call_sid, twiml)
        except _TwilioTransientError as e:
            raise ExternalServiceError("Twilio", str(e)) from e

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=3),
        retry=retry_if_exception_type((httpx.RequestError, _TwilioTransientError)),
        reraise=True,
    )
    async def _send_sms_inner(self, to: str, from_: str, body: str, idempotency_key: str) -> dict:
        r = await self._request(
            "POST",
            self._url("Messages.json"),
            data={"To": to, "From": from_, "Body": body},
            headers={"Idempotency-Key": idempotency_key},
        )
        self._check(r, "send_sms")
        return r.json()

    async def send_sms(self, to: str, from_: str, body: str) -> dict:
        idempotency_key = str(uuid.uuid4())
        logger.info("twilio_send_sms to=%s from=%s idempotency=%s", to, from_, idempotency_key)
        try:
            return await self._send_sms_inner(to, from_, body, idempotency_key)
        except _TwilioTransientError as e:
            raise ExternalServiceError("Twilio", str(e)) from e

    async def get_balance(self) -> dict:
        """Return the Twilio account balance payload.

        Twilio returns the remaining project balance as a string decimal and a
        currency code from the Balance resource.
        """
        r = await self._request("GET", self._url("Balance.json"))
        self._check(r, "get_balance")
        return r.json()

    async def search_available_numbers(
        self,
        country: str = "US",
        area_code: str | None = None,
        contains: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        params: dict[str, Any] = {"Limit": limit, "VoiceEnabled": "true"}
        if area_code:
            params["AreaCode"] = area_code
        if contains:
            params["Contains"] = contains
        r = await self._request(
            "GET",
            f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/AvailablePhoneNumbers/{country}/Local.json",
            params=params,
        )
        self._check(r, "search_numbers")
        return r.json().get("available_phone_numbers", [])

    async def purchase_number(self, phone_number: str, voice_url: str, status_callback: str) -> dict:
        logger.info("twilio_purchase_number number=%s", phone_number)
        r = await self._request(
            "POST",
            self._url("IncomingPhoneNumbers.json"),
            data={
                "PhoneNumber": phone_number,
                "VoiceUrl": voice_url,
                "VoiceMethod": "POST",
                "StatusCallback": status_callback,
            },
        )
        self._check(r, "purchase_number")
        return r.json()

    async def release_number(self, twilio_sid: str) -> None:
        logger.info("twilio_release_number sid=%s", twilio_sid)
        r = await self._request("DELETE", self._url(f"IncomingPhoneNumbers/{twilio_sid}.json"))
        self._check(r, "release_number")

    async def update_number_webhook(self, twilio_sid: str, voice_url: str) -> None:
        r = await self._request(
            "POST",
            self._url(f"IncomingPhoneNumbers/{twilio_sid}.json"),
            data={"VoiceUrl": voice_url, "VoiceMethod": "POST"},
        )
        self._check(r, "update_webhook")

    def validate_signature(self, url: str, params: dict, signature: str) -> bool:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(self.auth_token)
        return validator.validate(url, params, signature)


def get_twilio_service(user=None) -> TwilioService:
    """Return a TwilioService using user's own Twilio credentials if available."""
    if user and user.twilio_account_sid and user.twilio_auth_token:
        from app.utils.crypto import decrypt
        try:
            token = decrypt(user.twilio_auth_token)
        except Exception:
            token = user.twilio_auth_token
        return TwilioService(account_sid=user.twilio_account_sid, auth_token=token)
    return TwilioService()
