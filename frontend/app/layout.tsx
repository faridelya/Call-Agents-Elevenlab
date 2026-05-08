import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voxara — AI Voice Agents for Your Business',
  description:
    'Build AI voice agents that make and receive calls for your business. No engineers. No call center. Live in minutes. Powered by ElevenLabs + Twilio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
