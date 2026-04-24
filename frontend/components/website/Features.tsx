'use client';

import { useState } from 'react';
import { SectionLabel, SectionHeading } from './shared';

// ─── Features ────────────────────────────────────────────────────────────────

const featureIcons = {
  phone: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  mic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  ),
  activity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  smile: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
      <line x1="9" y1="9" x2="9.01" y2="9"/>
      <line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
  ),
  chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
    </svg>
  ),
};

const features = [
  { icon: featureIcons.phone,    color: '#7C6EFA', title: 'Outbound Campaigns',  desc: 'Launch AI-powered campaigns at scale. Personalize every call with live CRM data.' },
  { icon: featureIcons.mic,      color: '#22D3EE', title: 'Inbound Handling',    desc: 'Your agent answers, qualifies, and routes — 24/7. Never miss a call again.' },
  { icon: featureIcons.activity, color: '#10B981', title: 'Live Transcription',  desc: 'Every word transcribed in real time. Review, search, and share conversations instantly.' },
  { icon: featureIcons.grid,     color: '#F59E0B', title: 'Tool Integrations',   desc: 'Connect CRM, calendars, product catalogs. Your agent acts on real data, not guesses.' },
  { icon: featureIcons.smile,    color: '#A89AF9', title: 'Custom Persona',      desc: 'Choose voices or clone your own. Set tone, style, and personality per agent.' },
  { icon: featureIcons.chart,    color: '#22D3EE', title: 'Analytics',           desc: 'Track outcomes, sentiment, and conversion. Continuously improve with every call.' },
];

export function FeaturesSection() {
  return (
    <section id="Features" style={{ padding: '100px 80px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 60 }}>
        <SectionLabel>Capabilities</SectionLabel>
        <SectionHeading sub="From outbound sales to 24/7 inbound support — one platform, unlimited agent possibilities.">
          Everything your voice team needs
        </SectionHeading>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {features.map((f) => (
          <FeatureCard key={f.title} {...f} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ icon, color, title, desc }: (typeof features)[number]) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#0D1422',
        border: `1px solid ${hov ? `${color}35` : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 16,
        padding: 24,
        transition: 'all 0.25s',
        cursor: 'default',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? `0 8px 32px ${color}12` : 'none',
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 11,
          background: `${color}14`,
          border: `1px solid ${color}28`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
          color,
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', marginBottom: 8, fontFamily: 'var(--font-inter), sans-serif' }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: '#3D4F68', lineHeight: 1.65, fontFamily: 'var(--font-inter), sans-serif' }}>
        {desc}
      </div>
    </div>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const steps = [
  { n: '01', title: 'Create an agent',  desc: 'Name your agent, choose a voice, write a prompt. Or start from a template: sales, support, shopkeeper.' },
  { n: '02', title: 'Connect tools',    desc: 'Attach CRM, calendar, product catalog, or custom webhooks. Your agent uses real data on every call.' },
  { n: '03', title: 'Get a number',     desc: 'Claim a phone number or bring your own. Set up inbound routing or upload a contact list for outbound.' },
  { n: '04', title: 'Go live',          desc: 'Flip the switch. Your agent starts handling calls. Monitor transcripts and outcomes in real time.' },
];

export function HowItWorksSection() {
  return (
    <section
      id="How It Works"
      style={{
        padding: '80px 0',
        background: '#060910',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <SectionLabel>How It Works</SectionLabel>
          <SectionHeading>Four steps to your first live call</SectionHeading>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 27,
              left: 'calc(12.5% + 8px)',
              right: 'calc(12.5% + 8px)',
              height: 1,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(124,110,250,0.5) 30%, rgba(34,211,238,0.5) 70%, transparent 100%)',
            }}
          />
          {steps.map((s, i) => (
            <div key={s.n} style={{ padding: '0 22px', textAlign: 'center' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: i === 0 ? 'linear-gradient(135deg, #7C6EFA, #5B4FD4)' : '#0D1422',
                  border: `1px solid ${i === 0 ? 'transparent' : 'rgba(255,255,255,0.09)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 22px',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 13,
                  fontWeight: 600,
                  color: i === 0 ? '#fff' : '#334155',
                  position: 'relative',
                  zIndex: 1,
                  boxShadow: i === 0 ? '0 0 20px rgba(124,110,250,0.4)' : 'none',
                }}
              >
                {s.n}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', marginBottom: 10, fontFamily: 'var(--font-inter), sans-serif' }}>
                {s.title}
              </div>
              <div style={{ fontSize: 12, color: '#3D4F68', lineHeight: 1.65, fontFamily: 'var(--font-inter), sans-serif' }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
