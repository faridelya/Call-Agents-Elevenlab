'use client';

import { useState } from 'react';
import { SectionLabel, SectionHeading } from './shared';

const checkIcon = (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const elevenlabsCode = `// Connect your ElevenLabs agent in Voxara
const agent = await voxara.agents.create({
  name: "Sales Outreach",
  provider: "elevenlabs",
  elevenlabs: {
    agent_id: "YOUR_ELEVENLABS_AGENT_ID",
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    model: "eleven_turbo_v2_5",
  },
  type: "outbound",
});`;

const twilioCode = `// Connect Twilio to your Voxara workspace
const workspace = await voxara.workspace.configure({
  telephony: {
    provider: "twilio",
    account_sid: process.env.TWILIO_ACCOUNT_SID,
    auth_token: process.env.TWILIO_AUTH_TOKEN,
    default_number: "+15550148823",
  },
});`;

const tabs = {
  elevenlabs: {
    color: '#00D082',
    label: 'ElevenLabs',
    badge: 'AI Voice Engine',
    headline: 'Studio-quality AI voices, on every call.',
    desc: "Voxara connects natively to ElevenLabs agents. Use any of ElevenLabs' ultra-realistic voices, or clone your own brand voice. Every call uses ElevenLabs' low-latency Turbo model for human-like conversation.",
    features: [
      'ElevenLabs Conversational AI agents (v2)',
      'Custom voice cloning — sound like your brand',
      'Ultra-low latency (<300ms) Turbo model',
      'Emotion-aware delivery for natural pacing',
      '30+ languages & accents supported',
    ],
    code: elevenlabsCode,
  },
  twilio: {
    color: '#EF4444',
    label: 'Twilio',
    badge: 'Telephony',
    headline: 'Any phone number. Any carrier. Any country.',
    desc: 'Voxara uses Twilio for global, enterprise-grade telephony. Claim a number instantly, port your existing numbers, or connect a SIP trunk. Outbound campaigns and inbound routing work out of the box.',
    features: [
      'Instant phone number provisioning',
      'Bring your own Twilio account (BYOA)',
      'SIP trunk & carrier-grade PSTN routing',
      'Inbound webhook + IVR fallback support',
      'Call recording, DTMF, and voicemail handling',
    ],
    code: twilioCode,
  },
} as const;

type TabKey = keyof typeof tabs;

function CodeLine({ line }: { line: string }) {
  const isComment = line.trim().startsWith('//');
  const isDeclaration = line.includes('await voxara') || line.includes('const ');
  const isKey = line.includes(':') && !isComment;
  const color = isComment ? '#334155' : isDeclaration ? '#00D082' : isKey ? '#64748B' : '#94A3B8';
  return <div style={{ color }}>{line}</div>;
}

export function IntegrationsSection() {
  const [active, setActive] = useState<TabKey>('elevenlabs');
  const t = tabs[active];

  return (
    <section
      style={{
        padding: '80px 80px',
        background: '#F8FAFC',
        borderTop: '1px solid #E2E8F0',
        borderBottom: '1px solid #E2E8F0',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <SectionLabel>Integrations</SectionLabel>
          <SectionHeading sub="Powered by the best infrastructure in the industry — connected with one click.">
            ElevenLabs + Twilio, built in
          </SectionHeading>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          {(Object.entries(tabs) as [TabKey, (typeof tabs)[TabKey]][]).map(([key, tab]) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 22px',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.25s',
                fontFamily: 'var(--font-syne), sans-serif',
                fontWeight: 700,
                fontSize: 14,
                background: active === key ? `${tab.color}12` : '#FFFFFF',
                border: `1px solid ${active === key ? tab.color + '50' : '#E2E8F0'}`,
                color: active === key ? tab.color : '#64748B',
                boxShadow: active === key ? `0 0 24px ${tab.color}20` : 'none',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: tab.color, opacity: active === key ? 1 : 0.35 }} />
              {tab.label}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: `${tab.color}18`,
                  color: tab.color,
                  fontFamily: 'var(--font-syne), sans-serif',
                  letterSpacing: '0.04em',
                }}
              >
                {tab.badge}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-syne), sans-serif',
                fontSize: 28,
                fontWeight: 800,
                color: '#0F172A',
                letterSpacing: '-0.025em',
                marginBottom: 14,
                lineHeight: 1.15,
              }}
            >
              {t.headline}
            </h3>
            <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 24, fontFamily: 'var(--font-inter), sans-serif' }}>
              {t.desc}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {t.features.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#64748B', fontFamily: 'var(--font-inter), sans-serif' }}>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: `${t.color}18`,
                      border: `1px solid ${t.color}35`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                      color: t.color,
                    }}
                  >
                    {checkIcon}
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Code block */}
          <div
            style={{
              background: '#0F172A',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(15,23,42,0.15)',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(0,208,130,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', gap: 5 }}>
                {['#EF4444', '#F59E0B', '#00D082'].map((c) => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: '#334155', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                voxara-setup.js
              </span>
            </div>
            <pre
              style={{
                padding: 20,
                fontSize: 11.5,
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                lineHeight: 1.75,
                color: '#64748B',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {t.code.split('\n').map((line, i) => (
                <CodeLine key={i} line={line} />
              ))}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
