import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono, Syne, Raleway } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Plus Jakarta Sans replaces Inter — more refined, slightly geometric, great at small sizes
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-inter',  // keep var name so all existing refs work unchanged
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-syne',
  display: 'swap',
});

// Raleway — elegant geometric display font for the brand wordmark
const raleway = Raleway({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-brand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Voxara — AI Voice Agents for Your Business',
  description:
    'Build AI voice agents that make and receive calls for your business. No engineers. No call center. Live in minutes. Powered by ElevenLabs + Twilio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} ${syne.variable} ${raleway.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
