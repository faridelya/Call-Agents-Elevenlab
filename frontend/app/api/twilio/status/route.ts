/**
 * POST /api/twilio/status
 * Receives call-status events from Twilio (initiated / ringing / answered / completed).
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const callSid = form.get('CallSid');
  const status  = form.get('CallStatus');
  const duration = form.get('CallDuration');

  console.log(`[twilio] Call ${callSid} → ${status}${duration ? ` (${duration}s)` : ''}`);

  // Return empty TwiML so Twilio doesn't complain
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
