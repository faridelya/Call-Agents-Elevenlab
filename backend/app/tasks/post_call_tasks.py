"""Post-call processing: transcript save, LLM outcome classification + summary, sentiment, CRM sync.

Flow
----
1. Re-fetch full EL transcript (more complete 60 s after call ended)
2. _llm_analyze_call() — single GPT-4o-mini call that returns:
       outcome   : authoritative classification from the full transcript
       summary   : 2-3 sentence human-readable summary
       next_action: what should happen next
   If log_call_outcome tool was called during the live call, that value is
   passed as a hint to the LLM which can confirm or override it.  The LLM
   wins when its confidence >= 0.7; the tool value wins otherwise.
3. Sentiment score (keyword heuristic, no LLM cost)
4. Lead status + campaign counters updated
"""
import io
import json
import wave as _wave
import structlog
from datetime import datetime, timezone
from sqlalchemy import select

log = structlog.get_logger(__name__)

# Outcomes the LLM can assign.  Keep in sync with log_call_outcome tool enum
# and Analytics.tsx OUTCOME_META.
OUTCOME_CHOICES = {
    # ── Goal achieved ──────────────────────────────────────────────────────────
    "goal_achieved":       "The primary purpose of the call was fully accomplished (generic).",
    "order_confirmed":     "A sale, order, or purchase was confirmed during the call.",
    "agreed_on_service":   "Contact verbally agreed to use the service or product.",
    "appointment_booked":  "A meeting, demo, or appointment was scheduled.",
    "payment_collected":   "A payment or commitment to pay was received.",
    "issue_resolved":      "A support issue or complaint was fully resolved.",
    # ── Positive progress ──────────────────────────────────────────────────────
    "interested":          "Contact showed genuine interest but made no commitment yet.",
    "demo_scheduled":      "A product demo or informational meeting was booked.",
    # ── Follow-up ──────────────────────────────────────────────────────────────
    "callback_requested":  "Contact asked to be called back at a later time.",
    "follow_up_needed":    "Follow-up is needed but no specific time was agreed.",
    "callback_scheduled":  "A specific callback date and time was agreed.",
    # ── Incomplete contact ──────────────────────────────────────────────────────
    "voicemail_left":      "A voicemail was left; no live conversation occurred.",
    "no_answer":           "The call was not answered and no voicemail was left.",
    "gatekeeper":          "Reached a receptionist or assistant; did not speak with the decision-maker.",
    # ── Declined ───────────────────────────────────────────────────────────────
    "not_interested":      "Contact explicitly stated they are not interested.",
    "not_qualified":       "Contact does not meet the criteria or eligibility requirements.",
    # ── Administrative ──────────────────────────────────────────────────────────
    "do_not_call":         "Contact requested to be removed from the calling list.",
    "wrong_number":        "The number reached the wrong person or is no longer valid.",
    "call_disconnected":   "The call ended unexpectedly before the conversation concluded.",
}

# Outcomes that count as positive / converted for analytics
POSITIVE_OUTCOMES = {
    "goal_achieved", "order_confirmed", "agreed_on_service",
    "appointment_booked", "payment_collected", "issue_resolved",
    "demo_scheduled", "interested",
}


async def post_call_processing(
    ctx: dict,
    call_id: str,
    llm_model: str = "",
    llm_temperature: float = 0.0,
    stt_provider: str = "",
) -> None:
    """ARQ task — runs after every call ends.

    llm_model, llm_temperature, stt_provider are passed from _finalize_call via
    the Redis call context — no extra DB fetch needed here.
    """
    db_factory = ctx["db_factory"]
    redis = ctx["redis"]

    async with db_factory() as db:
        from app.models.call import Call
        result = await db.execute(select(Call).where(Call.id == call_id))
        call = result.scalar_one_or_none()
        if not call:
            return

        call_key = f"call:{call.twilio_call_sid or call_id}"

        # ── 1. Re-fetch full transcript from ElevenLabs ───────────────────────
        # _finalize_call saves a partial transcript right after call ends; EL
        # needs ~60s to finalize transcription. This task fires after that delay.
        if call.elevenlabs_conversation_id:
            from app.services.elevenlabs_service import elevenlabs_service
            conv = await elevenlabs_service.get_conversation_full(call.elevenlabs_conversation_id)

            if conv["duration_seconds"] and not call.duration_seconds:
                call.duration_seconds = conv["duration_seconds"]

            fresh = conv["transcript"]
            if fresh and len(fresh) >= len(call.transcript or []):
                # Preserve system/human_agent/customer entries that EL doesn't track.
                # 'customer' is used for diarized customer speech in the human leg.
                extras = [
                    e for e in (call.transcript or [])
                    if e.get("role") in ("system", "human_agent", "customer")
                ]
                call.transcript = fresh + extras
                log.info("post_call_el_transcript_saved",
                         call_id=call_id, msgs=len(fresh),
                         extras=len(extras),
                         conv_id=call.elevenlabs_conversation_id)

        # Fallback: Redis bridge messages (legacy path)
        if not call.transcript:
            raw = await redis.lrange(f"{call_key}:transcript", 0, -1)
            if raw:
                call.transcript = [json.loads(t) for t in raw]

        # Stage timeline
        if not call.stage_timeline:
            raw_stages = await redis.lrange(f"call:{call.id}:stages", 0, -1)
            if not raw_stages:
                raw_stages = await redis.lrange(f"{call_key}:stages", 0, -1)
            if raw_stages:
                call.stage_timeline = [json.loads(s) for s in raw_stages]

        # ── 2. LLM: classify outcome + generate summary ───────────────────────
        # Skip if the EL webhook already ran classification — no duplicate LLM cost.
        # Exception: if a human_agent entry exists (from transcribe_human_leg) we
        # force re-classification so the full conversation informs the outcome.
        has_human_leg = any(e.get("role") == "human_agent" for e in (call.transcript or []))
        already_classified = bool(call.auto_summary and call.outcome) and not has_human_leg
        if already_classified:
            log.info("post_call_llm_skipped",
                     call_id=call_id,
                     reason="el_webhook_already_classified",
                     outcome=call.outcome)
        else:
            if has_human_leg and call.auto_summary and call.outcome:
                log.info("post_call_llm_reclassify",
                         call_id=call_id,
                         note="Human leg transcript present — re-classifying with full conversation")
            hint = call.outcome  # set by log_call_outcome tool during the live call
            analysis = await _llm_analyze_call(
                call.transcript,
                hint_outcome=hint,
                llm_model=llm_model or None,
                llm_temperature=llm_temperature or None,
            )
            if analysis:
                if not hint or analysis.get("confidence", 0) >= 0.7:
                    call.outcome = analysis.get("outcome") or hint
                if not call.auto_summary:
                    call.auto_summary = analysis.get("summary")
                if not call.next_action and analysis.get("next_action"):
                    call.next_action = analysis.get("next_action")
                log.info("post_call_outcome_classified",
                         call_id=call_id,
                         outcome=call.outcome,
                         hint_was=hint,
                         confidence=analysis.get("confidence"),
                         overrode_hint=hint is not None and call.outcome != hint)

        # ── 3. Sentiment + talk ratio (cheap heuristic, always recompute) ─────
        # Recompute since transcript may have been updated by step 1 above.
        call.sentiment_score = _compute_sentiment(call.transcript)
        call.talk_ratio      = _compute_talk_ratio(call.transcript)

        # ── 4. Lead stats ──────────────────────────────────────────────────────
        await _update_lead_stats(call, db)

        await db.commit()

        # ── 5. Campaign counters ───────────────────────────────────────────────
        if call.campaign_id:
            await _update_campaign_counters(call, db)

        log.info("post_call_done", call_id=call_id, outcome=call.outcome)

        # ── 6. Notify frontend ─────────────────────────────────────────────────
        # Skip campaign calls — Campaigns page shows cards, not live transcript viewers.
        if not call.campaign_id:
            try:
                from app.websockets.event_bus import event_manager
                await event_manager.broadcast(call.user_id, {
                    "type": "call_processed",
                    "call_record_id": call_id,
                    "outcome": call.outcome,
                    "sentiment_score": call.sentiment_score,
                    "auto_summary": call.auto_summary,
                    "next_action": call.next_action,
                    "talk_ratio": call.talk_ratio,
                    "transcript_len": len(call.transcript or []),
                })
            except Exception:
                pass


# ── LLM analysis ──────────────────────────────────────────────────────────────

async def _llm_analyze_call(
    transcript: list,
    hint_outcome: str | None = None,
    llm_model: str | None = None,
    llm_temperature: float | None = None,
) -> dict | None:
    """
    Classify call outcome + write summary using the agent's configured LLM.
    Routes to the right provider based on model name — no fallback.

    Supported providers (requires matching API key in .env):
      gpt-*     → OpenAI         (OPENAI_API_KEY)
      gemini-*  → Google Gemini  (GOOGLE_API_KEY)
      claude-*  → Anthropic      (ANTHROPIC_API_KEY)

    Returns {outcome, confidence, summary, next_action} or None on failure.
    """
    from app.config import settings
    import httpx

    if not transcript or not llm_model:
        if not llm_model:
            log.warning("post_call_llm_skipped", reason="no llm_model configured on agent")
        return None

    text = "\n".join(
        f"{e['role'].upper()}: {e.get('text', '')}"
        for e in transcript[-30:]
        if e.get("text", "").strip()
    )
    if not text:
        return None

    choices_text = "\n".join(f'  "{k}" — {v}' for k, v in OUTCOME_CHOICES.items())

    hint_block = ""
    if hint_outcome:
        hint_block = (
            f'\n\nThe live agent logged "{hint_outcome}" during the call as a hint. '
            "Validate this — use it if it matches the transcript, override it if a more "
            "accurate outcome exists in the list."
        )

    system_msg = "You classify call outcomes and summarize conversations. Always respond with valid JSON only — no markdown, no explanation."
    user_msg = f"""Analyze this call transcript and classify the outcome.
{hint_block}

TRANSCRIPT:
{text}

OUTCOME OPTIONS (choose exactly one key):
{choices_text}

Respond with this JSON object only:
{{
  "outcome": "<key from the list above>",
  "confidence": <0.0 to 1.0>,
  "summary": "<2-3 sentences: what was discussed, contact reaction, and result>",
  "next_action": "<one sentence on what should happen next, or 'No action needed'>"
}}"""

    try:
        raw = await _route_llm(llm_model, llm_temperature or 0.3, system_msg, user_msg, settings)
        if raw is None:
            return None
        parsed = json.loads(raw)
        if parsed.get("outcome") not in OUTCOME_CHOICES:
            parsed["outcome"] = hint_outcome
        log.info("post_call_llm_done", model=llm_model,
                 outcome=parsed.get("outcome"), confidence=parsed.get("confidence"))
        return parsed
    except Exception as exc:
        log.warning("post_call_llm_failed", model=llm_model, error=str(exc))
        return None


async def _route_llm(model: str, temperature: float, system: str, user: str, settings) -> str | None:
    """
    Route an LLM call to the correct provider based on the model name.
    Returns the raw response string (JSON text) or None if the API key is missing.
    """
    import httpx

    async with httpx.AsyncClient(timeout=30.0) as client:

        # ── OpenAI: gpt-* ─────────────────────────────────────────────────────
        if model.startswith("gpt-"):
            if not settings.openai_api_key:
                log.warning("post_call_llm_no_key", model=model, provider="openai")
                return None
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={
                    "model": model,
                    "temperature": temperature,
                    "max_tokens": 400,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user",   "content": user},
                    ],
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

        # ── Google Gemini: gemini-* (OpenAI-compatible endpoint) ──────────────
        elif model.startswith("gemini-"):
            if not settings.google_api_key:
                log.warning("post_call_llm_no_key", model=model, provider="google")
                return None
            r = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                headers={"Authorization": f"Bearer {settings.google_api_key}"},
                json={
                    "model": model,
                    "temperature": temperature,
                    "max_tokens": 400,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user",   "content": user},
                    ],
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

        # ── Anthropic: claude-* ───────────────────────────────────────────────
        elif model.startswith("claude-"):
            if not settings.anthropic_api_key:
                log.warning("post_call_llm_no_key", model=model, provider="anthropic")
                return None
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "temperature": temperature,
                    "max_tokens": 400,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            r.raise_for_status()
            return r.json()["content"][0]["text"]

        # ── Unknown provider ──────────────────────────────────────────────────
        else:
            log.warning("post_call_llm_unsupported_model", model=model)
            return None


# ── Sentiment / talk ratio (no LLM) ──────────────────────────────────────────

def _compute_sentiment(transcript: list) -> float:
    positive = {"interested", "yes", "great", "sure", "absolutely", "perfect", "love", "good", "excellent", "definitely", "sounds good", "agree", "confirmed"}
    negative = {"no", "not", "never", "don't", "won't", "can't", "stop", "remove", "unsubscribe", "busy", "not interested", "wrong"}
    pos_count = neg_count = 0
    for entry in transcript:
        if entry.get("role") == "user":
            words = set(entry.get("text", "").lower().split())
            pos_count += len(words & positive)
            neg_count += len(words & negative)
    total = pos_count + neg_count
    return round(pos_count / total, 2) if total else 0.5


def _compute_talk_ratio(transcript: list) -> float:
    agent_words = sum(len(e.get("text", "").split()) for e in transcript if e.get("role") == "agent")
    user_words  = sum(len(e.get("text", "").split()) for e in transcript if e.get("role") == "user")
    total = agent_words + user_words
    return round(agent_words / total, 2) if total else 0.5


def _outcome_to_status(outcome: str) -> str:
    if outcome in POSITIVE_OUTCOMES:
        return "qualified"
    if outcome in {"callback_requested", "callback_scheduled", "follow_up_needed", "demo_scheduled"}:
        return "contacted"
    if outcome == "do_not_call":
        return "disqualified"
    return "contacted"


async def _update_lead_stats(call, db) -> None:
    """Update lead rollups from call rows so retries do not double-count."""
    if not call.lead_id:
        return

    from app.models.lead import Lead
    from sqlalchemy import func

    lead_result = await db.execute(select(Lead).where(Lead.id == call.lead_id))
    lead = lead_result.scalar_one_or_none()
    if not lead:
        return

    CallModel = type(call)
    total_calls = await db.execute(
        select(func.count())
        .select_from(CallModel)
        .where(CallModel.lead_id == lead.id)
    )
    last_called = await db.execute(
        select(func.max(CallModel.started_at))
        .where(CallModel.lead_id == lead.id)
    )

    lead.total_calls = total_calls.scalar_one()
    lead.last_called_at = last_called.scalar()
    if call.outcome:
        lead.lead_status = _outcome_to_status(call.outcome)


def _split_stereo_wav(wav_bytes: bytes) -> tuple[bytes | None, bytes | None]:
    """Split a Twilio dual-channel PCM WAV into (customer, human_agent) mono WAVs.

    Twilio dual-channel convention for <Dial recordingChannels="dual">:
      channel 0 (left)  = original inbound caller  → customer
      channel 1 (right) = the number we dialed     → human agent

    Uses only Python stdlib (wave module) — no extra dependencies.
    Returns (None, None) if the file is mono, µ-law encoded, or otherwise
    cannot be split (the caller falls back to diarization in that case).
    """
    try:
        buf = io.BytesIO(wav_bytes)
        with _wave.open(buf, "rb") as w:
            if w.getnchannels() != 2 or w.getcomptype() != "NONE":
                return None, None
            sampwidth = w.getsampwidth()
            framerate = w.getframerate()
            raw = w.readframes(w.getnframes())

        frame_size = sampwidth * 2  # bytes per stereo frame
        left = bytearray()
        right = bytearray()
        for i in range(0, len(raw), frame_size):
            chunk = raw[i : i + frame_size]
            if len(chunk) == frame_size:
                left.extend(chunk[:sampwidth])   # left  channel = customer
                right.extend(chunk[sampwidth:])  # right channel = human agent

        def _to_mono_wav(samples: bytes) -> bytes:
            out = io.BytesIO()
            with _wave.open(out, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(sampwidth)
                w.setframerate(framerate)
                w.writeframes(samples)
            return out.getvalue()

        return _to_mono_wav(bytes(left)), _to_mono_wav(bytes(right))
    except Exception:
        return None, None


def _words_to_utterances(
    words: list[dict], role: str, gap_sec: float = 0.8
) -> list[tuple[float, str, str]]:
    """Group EL STT words into utterances using silence gaps.

    Returns [(start_sec, role, text)] sorted by start time.
    gap_sec: pause longer than this starts a new utterance (0.8 s is natural speech cadence).
    """
    utterances: list[tuple[float, str, str]] = []
    current: list[str] = []
    current_start: float | None = None
    last_end: float | None = None

    for word in words:
        text = (word.get("text") or "").strip()
        if not text:
            continue
        start = float(word.get("start") or 0.0)
        end = float(word.get("end") or start)

        if last_end is not None and (start - last_end) > gap_sec:
            if current and current_start is not None:
                utterances.append((current_start, role, " ".join(current)))
            current = []
            current_start = None

        if current_start is None:
            current_start = start
        current.append(text)
        last_end = end

    if current and current_start is not None:
        utterances.append((current_start, role, " ".join(current)))

    return utterances


async def _gather(*coros):
    """Run multiple coroutines concurrently and return their results in order."""
    import asyncio
    return await asyncio.gather(*coros)


def _assign_roles_by_content(words: list[dict], now_iso: str) -> list[dict]:
    """Label diarized speakers as customer/human_agent based on conversation content.

    Used only as a fallback when dual-channel split is unavailable.
    Groups words by speaker_id, then identifies the human agent speaker by looking
    for professional greeting phrases typically used by support agents. The other
    speaker is labeled customer. If content-based detection is inconclusive, falls
    back to labeling the first speaker as customer per Twilio call ordering.
    """
    AGENT_PHRASES = {
        "thank you for holding", "thank you for your patience",
        "this is ", "my name is ", "how can i help", "how may i help",
        "how can i assist", "welcome to", "speaking", "team member",
        "support", "customer service", "let me check", "one moment",
        "i apologize", "i understand your concern",
    }

    # Group words per speaker
    speaker_texts: dict[str, list[str]] = {}
    speaker_first_seen: dict[str, float] = {}
    for word in words:
        sid = word.get("speaker_id")
        if sid is None:
            continue
        sid = str(sid)
        text = (word.get("text") or "").strip().lower()
        if not text:
            continue
        speaker_texts.setdefault(sid, []).append(text)
        if sid not in speaker_first_seen:
            speaker_first_seen[sid] = float(word.get("start") or 0.0)

    if not speaker_texts:
        return []

    # Score each speaker: how many agent-phrase tokens appear in their text?
    agent_speaker: str | None = None
    best_score = 0
    for sid, tokens in speaker_texts.items():
        full = " ".join(tokens)
        score = sum(1 for phrase in AGENT_PHRASES if phrase in full)
        if score > best_score:
            best_score = score
            agent_speaker = sid

    # If no phrase matched, treat the speaker who appeared LATER as the human agent
    # (the customer was already on the call; the agent picks up after the Dial connects)
    if agent_speaker is None and speaker_first_seen:
        agent_speaker = max(speaker_first_seen, key=lambda s: speaker_first_seen[s])

    # Build utterances with the same grouping logic as _words_to_utterances
    utterances: list[tuple[float, str, str]] = []
    current: list[str] = []
    current_start: float | None = None
    current_sid: str | None = None
    last_end: float | None = None
    GAP = 0.8

    for word in words:
        sid = str(word.get("speaker_id")) if word.get("speaker_id") is not None else "_unknown"
        text = (word.get("text") or "").strip()
        if not text:
            continue
        start = float(word.get("start") or 0.0)
        end = float(word.get("end") or start)

        speaker_changed = (sid != current_sid)
        long_pause = last_end is not None and (start - last_end) > GAP

        if (speaker_changed or long_pause) and current and current_sid is not None:
            role = "human_agent" if current_sid == agent_speaker else "customer"
            utterances.append((current_start or 0.0, role, " ".join(current)))
            current = []
            current_start = None

        if current_start is None:
            current_start = start
        current_sid = sid
        current.append(text)
        last_end = end

    if current and current_sid is not None:
        role = "human_agent" if current_sid == agent_speaker else "customer"
        utterances.append((current_start or 0.0, role, " ".join(current)))

    return [
        {"role": role, "text": text.strip(), "timestamp": now_iso}
        for _, role, text in utterances
        if text.strip()
    ]


async def transcribe_human_leg(ctx: dict, call_id: str, recording_sid: str) -> None:
    """ARQ task — download Twilio recording for a transferred call and transcribe via ElevenLabs STT.

    Primary path (dual-channel recording):
      Twilio records with recordingChannels="dual" so ch0=customer, ch1=human_agent
      by protocol. We split the stereo WAV with stdlib wave, transcribe each mono
      channel separately, then interleave utterances by word start-time. No guessing.

    Fallback path (mono recording or WAV parse failure):
      Send recording to EL STT with diarize=true. Speaker role assignment falls back
      to a content-based heuristic — less reliable than the dual-channel path.

    Safe-by-design: even on total failure a placeholder entry is appended so the
    record shows the transfer happened. Original AI conversation is never modified.
    """
    from app.config import settings
    import httpx

    # ── 1. Resolve credentials + phone numbers for logging ───────────────────
    db_factory = ctx["db_factory"]
    redis = ctx["redis"]
    stt_model_id = "scribe_v2"
    twilio_account_sid = settings.twilio_account_sid
    twilio_auth_token = settings.twilio_auth_token
    elevenlabs_api_key = settings.elevenlabs_api_key
    credential_source = "platform" if twilio_account_sid and twilio_auth_token else "missing"
    # Phone numbers help verify channel assignment (customer=ch0, agent=ch1)
    customer_number: str = ""
    agent_number: str = ""

    async with db_factory() as db:
        from app.models.call import Call
        from app.models.user import User as UserModel
        from app.utils.crypto import decrypt
        call_result = await db.execute(select(Call).where(Call.id == call_id))
        call_obj = call_result.scalar_one_or_none()
        if call_obj:
            customer_number = getattr(call_obj, "from_number", "") or ""
            # transferred_to is stamped in Redis when the transfer tool fires
            raw_to = await redis.hget(f"call:{call_id}", "transferred_to")
            agent_number = (raw_to if isinstance(raw_to, str) else (raw_to.decode() if raw_to else "")) or ""
        if call_obj and call_obj.user_id:
            user_result = await db.execute(select(UserModel).where(UserModel.id == call_obj.user_id))
            user_obj = user_result.scalar_one_or_none()
            if user_obj:
                if user_obj.twilio_account_sid and user_obj.twilio_auth_token:
                    twilio_account_sid = user_obj.twilio_account_sid
                    try:
                        twilio_auth_token = decrypt(user_obj.twilio_auth_token)
                    except Exception:
                        twilio_auth_token = user_obj.twilio_auth_token
                    credential_source = "user"
                if user_obj.elevenlabs_api_key:
                    try:
                        elevenlabs_api_key = decrypt(user_obj.elevenlabs_api_key)
                    except Exception:
                        elevenlabs_api_key = user_obj.elevenlabs_api_key

    # ── 2. Download + transcribe ───────────────────────────────────────────────
    failure_reason: str | None = None
    wav_bytes:  bytes | None = None   # stereo WAV (dual-channel) preferred
    mp3_bytes:  bytes | None = None   # fallback if WAV unavailable
    diarized_entries: list[dict] = []
    fallback_text: str | None = None

    if not twilio_account_sid or not twilio_auth_token:
        failure_reason = "Twilio credentials not configured"
        log.warning("transcribe_human_leg_no_twilio_creds", call_id=call_id)
    elif not elevenlabs_api_key:
        failure_reason = "ElevenLabs API key not configured"
        log.warning("transcribe_human_leg_no_el_key", call_id=call_id)
    else:
        log.info("transcribe_human_leg_start", call_id=call_id,
                 stt_model=stt_model_id, twilio_credential_source=credential_source)

        # Download WAV first — needed for dual-channel stereo splitting.
        # Fall back to MP3 if WAV download fails.
        for ext in (".wav", ".mp3"):
            url = (
                f"https://api.twilio.com/2010-04-01/Accounts/"
                f"{twilio_account_sid}/Recordings/{recording_sid}{ext}"
            )
            try:
                async with httpx.AsyncClient(
                    auth=(twilio_account_sid, twilio_auth_token),
                    timeout=120.0,
                    follow_redirects=True,
                ) as client:
                    r = await client.get(url)

                if r.status_code == 200:
                    if ext == ".wav":
                        wav_bytes = r.content
                    else:
                        mp3_bytes = r.content
                    log.info("transcribe_human_leg_downloaded",
                             call_id=call_id, format=ext, bytes=len(r.content))
                    break
                else:
                    log.warning("transcribe_human_leg_download_failed",
                                call_id=call_id, format=ext, http_status=r.status_code)
            except Exception as exc:
                log.warning("transcribe_human_leg_download_error",
                            call_id=call_id, format=ext, error=str(exc))

        if not wav_bytes and not mp3_bytes:
            failure_reason = "Could not download recording in any format"
            log.error("transcribe_human_leg_no_audio", call_id=call_id,
                      recording_sid=recording_sid)

        # ── Dual-channel path (preferred) ──────────────────────────────────
        wav_was_stereo = False
        if wav_bytes:
            customer_wav, agent_wav = _split_stereo_wav(wav_bytes)
            if customer_wav and agent_wav:
                wav_was_stereo = True
                log.info("transcribe_human_leg_dual_channel",
                         call_id=call_id, model=stt_model_id,
                         ch0_customer=customer_number or "unknown",
                         ch1_human_agent=agent_number or "unknown",
                         note="Twilio dual-channel: ch0=A-leg(customer), ch1=B-leg(human_agent)")
                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        cust_resp, agent_resp = await _gather(
                            client.post(
                                "https://api.elevenlabs.io/v1/speech-to-text",
                                headers={"xi-api-key": elevenlabs_api_key},
                                files={"file": ("customer.wav", customer_wav, "audio/wav")},
                                data={"model_id": stt_model_id},
                            ),
                            client.post(
                                "https://api.elevenlabs.io/v1/speech-to-text",
                                headers={"xi-api-key": elevenlabs_api_key},
                                files={"file": ("agent.wav", agent_wav, "audio/wav")},
                                data={"model_id": stt_model_id},
                            ),
                        )

                    now_iso = datetime.now(timezone.utc).isoformat()
                    cust_words  = cust_resp.json().get("words", [])  if cust_resp.status_code  == 200 else []
                    agent_words = agent_resp.json().get("words", []) if agent_resp.status_code == 200 else []

                    cust_utterances  = _words_to_utterances(cust_words,  "customer")
                    agent_utterances = _words_to_utterances(agent_words, "human_agent")
                    merged = sorted(cust_utterances + agent_utterances, key=lambda t: t[0])

                    diarized_entries = [
                        {"role": role, "text": text.strip(), "timestamp": now_iso}
                        for _, role, text in merged
                        if text.strip()
                    ]
                    n_cust  = sum(1 for e in diarized_entries if e["role"] == "customer")
                    n_agent = sum(1 for e in diarized_entries if e["role"] == "human_agent")
                    log.info("transcribe_human_leg_dual_ok",
                             call_id=call_id, utterances=len(diarized_entries),
                             customer_turns=n_cust, human_agent_turns=n_agent)
                except Exception as exc:
                    failure_reason = f"Dual-channel transcription error: {exc}"
                    log.error("transcribe_human_leg_dual_error",
                              call_id=call_id, error=str(exc))
            else:
                log.info("transcribe_human_leg_mono_wav",
                         call_id=call_id, note="WAV is mono — falling back to diarization")

        # ── Diarization fallback (mono recording or dual-channel failed) ────
        if not diarized_entries and (mp3_bytes or (wav_bytes and not wav_was_stereo)):
            audio = mp3_bytes or wav_bytes
            fname = "recording.mp3" if mp3_bytes else "recording.wav"
            ctype = "audio/mpeg"    if mp3_bytes else "audio/wav"
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    r = await client.post(
                        "https://api.elevenlabs.io/v1/speech-to-text",
                        headers={"xi-api-key": elevenlabs_api_key},
                        files={"file": (fname, audio, ctype)},
                        data={"model_id": stt_model_id, "diarize": "true"},
                    )
                if r.status_code == 200:
                    stt_data = r.json()
                    now_iso = datetime.now(timezone.utc).isoformat()
                    words = stt_data.get("words", [])
                    speakers = {w.get("speaker_id") for w in words if "speaker_id" in w}

                    if len(speakers) >= 2:
                        # Two distinct speakers detected — use LLM to label roles
                        # by examining each speaker's text content, then assign.
                        diarized_entries = _assign_roles_by_content(words, now_iso)
                        log.info("transcribe_human_leg_diarized_content_labeled",
                                 call_id=call_id, utterances=len(diarized_entries))
                    elif words:
                        # Single speaker — mark everything as part of conversation
                        raw_text = (stt_data.get("text") or "").strip()
                        if raw_text:
                            fallback_text = raw_text
                    else:
                        raw_text = (stt_data.get("text") or "").strip()
                        if raw_text:
                            fallback_text = raw_text
                        else:
                            failure_reason = "STT returned empty transcript"
                            log.warning("transcribe_human_leg_el_empty",
                                        call_id=call_id, model=stt_model_id)
                else:
                    failure_reason = f"ElevenLabs STT returned HTTP {r.status_code}"
                    log.error("transcribe_human_leg_el_failed",
                              call_id=call_id, model=stt_model_id,
                              http_status=r.status_code, body=r.text[:200])
            except Exception as exc:
                failure_reason = f"ElevenLabs STT error: {exc}"
                log.error("transcribe_human_leg_el_error", call_id=call_id, error=str(exc))

    # ── 3. Build new_entries — always non-empty ───────────────────────────────
    now_iso = datetime.now(timezone.utc).isoformat()
    audio_bytes = wav_bytes or mp3_bytes
    if diarized_entries:
        new_entries = diarized_entries
    elif fallback_text:
        new_entries = [{
            "role": "human_agent",
            "text": f"[Human Agent Conversation]\n{fallback_text}",
            "timestamp": now_iso,
        }]
    elif audio_bytes:
        new_entries = [{
            "role": "human_agent",
            "text": (
                f"[Human Agent Conversation — recording retrieved "
                f"({len(audio_bytes):,} bytes, SID: {recording_sid}) "
                f"but transcription failed: {failure_reason}]"
            ),
            "timestamp": now_iso,
        }]
    else:
        new_entries = [{
            "role": "human_agent",
            "text": (
                f"[Human Agent Conversation — recording could not be retrieved "
                f"(SID: {recording_sid}). Reason: {failure_reason}]"
            ),
            "timestamp": now_iso,
        }]

    # ── 4. Append to call transcript ─────────────────────────────────────────
    async with db_factory() as db:
        from app.models.call import Call
        result = await db.execute(select(Call).where(Call.id == call_id))
        call = result.scalar_one_or_none()
        if not call:
            log.warning("transcribe_human_leg_call_not_found", call_id=call_id)
            return

        call.transcript = list(call.transcript or []) + new_entries
        await db.commit()

        log.info("transcribe_human_leg_saved",
                 call_id=call_id,
                 entries_added=len(new_entries),
                 method="dual_channel" if (diarized_entries and wav_bytes) else "diarization")


async def _update_campaign_counters(call, db) -> None:
    from app.models.campaign import Campaign
    from sqlalchemy import select, func

    result = await db.execute(select(Campaign).where(Campaign.id == call.campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        return

    CallModel = type(call)
    final_failed_statuses = ("failed", "busy", "no-answer", "canceled")
    active_statuses = ("initiated", "ringing", "in-progress")

    # Recompute counters from call rows instead of incrementing here. Both the
    # ElevenLabs webhook and the ARQ safety-net can process the same call, so
    # incremental updates are not idempotent.
    answered_count = (
        await db.execute(
            select(func.count())
            .select_from(CallModel)
            .where(
                CallModel.campaign_id == campaign.id,
                CallModel.answered_at.isnot(None),
            )
        )
    ).scalar_one()
    completed_count = (
        await db.execute(
            select(func.count())
            .select_from(CallModel)
            .where(
                CallModel.campaign_id == campaign.id,
                CallModel.status == "completed",
            )
        )
    ).scalar_one()
    failed_count = (
        await db.execute(
            select(func.count())
            .select_from(CallModel)
            .where(
                CallModel.campaign_id == campaign.id,
                CallModel.status.in_(final_failed_statuses),
            )
        )
    ).scalar_one()
    active_count = (
        await db.execute(
            select(func.count())
            .select_from(CallModel)
            .where(
                CallModel.campaign_id == campaign.id,
                CallModel.status.in_(active_statuses),
            )
        )
    ).scalar_one()

    campaign.contacts_answered = answered_count
    campaign.contacts_completed = completed_count
    campaign.contacts_failed = failed_count

    # Conversion rate: any positive outcome counts, not just "interested"
    if campaign.contacts_completed > 0:
        positive = await db.execute(
            select(func.count()).select_from(CallModel).where(
                CallModel.campaign_id == campaign.id,
                CallModel.outcome.in_(list(POSITIVE_OUTCOMES)),
            )
        )
        campaign.conversion_rate = round(positive.scalar() / campaign.contacts_completed * 100, 1)
    else:
        campaign.conversion_rate = 0.0

    avg_duration = await db.execute(
        select(func.avg(CallModel.duration_seconds))
        .where(
            CallModel.campaign_id == campaign.id,
            CallModel.duration_seconds.isnot(None),
        )
    )
    avg_duration_value = avg_duration.scalar()
    campaign.avg_call_duration = round(float(avg_duration_value), 1) if avg_duration_value else 0.0

    if (
        campaign.status == "running"
        and campaign.contacts_called >= len(campaign.contacts)
        and active_count == 0
    ):
        campaign.status = "completed"
        campaign.completed_at = datetime.now(timezone.utc).isoformat()

    await db.commit()
