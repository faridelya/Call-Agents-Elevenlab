import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
const authToken  = process.env.TWILIO_AUTH_TOKEN  ?? '';

export const twilioClient = twilio(accountSid, authToken);

export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? '';

/** Returns the WSS URL that Twilio should stream audio to. */
export function streamUrl(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? '').replace(/^http/, 'ws');
  return `${base}/api/twilio/stream`;
}

/** Returns the HTTPS URL for Twilio webhooks. */
export function webhookUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  return `${base}${path}`;
}
