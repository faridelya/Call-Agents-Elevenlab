/**
 * POST /api/twilio/outbound
 *
 * Initiates an outbound call via Twilio, then connects it to the ElevenLabs agent.
 *
 * Body (JSON):
 *   { "to": "+15551234567" }
 *
 * Optional overrides:
 *   { "to": "...", "agentId": "agent_xxx", "systemPrompt": "..." }
 */
import { NextRequest, NextResponse } from 'next/server';
import { twilioClient, TWILIO_PHONE_NUMBER, streamUrl, webhookUrl } from '@/lib/twilio';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { to?: string; agentId?: string; systemPrompt?: string };
    const { to } = body;

    if (!to) {
      return NextResponse.json({ error: 'Missing "to" phone number' }, { status: 400 });
    }

    const wsUrl     = streamUrl();
    const statusUrl = webhookUrl('/api/twilio/status');

    // TwiML: once the callee picks up, open the media stream to our bridge
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="${statusUrl}" method="POST">
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;

    const call = await twilioClient.calls.create({
      to,
      from:    TWILIO_PHONE_NUMBER,
      twiml,
      statusCallback:       statusUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent:  ['initiated', 'ringing', 'answered', 'completed'],
    });

    return NextResponse.json({ callSid: call.sid, status: call.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
