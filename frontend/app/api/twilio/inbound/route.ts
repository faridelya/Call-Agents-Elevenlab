/**
 * POST /api/twilio/inbound
 *
 * Twilio calls this webhook when someone dials your phone number.
 * We respond with TwiML that opens a media stream to our WebSocket bridge.
 */
import { NextRequest, NextResponse } from 'next/server';
import { streamUrl, webhookUrl } from '@/lib/twilio';

export async function POST(req: NextRequest) {
  const wsUrl     = streamUrl();
  const statusUrl = webhookUrl('/api/twilio/status');

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="${statusUrl}" method="POST">
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
