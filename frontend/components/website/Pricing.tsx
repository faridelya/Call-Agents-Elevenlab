'use client';

import { useState } from 'react';
import { SectionLabel, SectionHeading, Btn } from './shared';

const checkGreenIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const plans = [
  {
    name: 'Starter',
    price: '$49',
    period: '/mo',
    desc: 'Perfect for solo founders and small teams.',
    features: ['500 minutes / month', '2 active agents', 'Basic analytics', 'Email support'],
    cta: 'Get Started',
    hi: false,
  },
  {
    name: 'Growth',
    price: '$199',
    period: '/mo',
    desc: 'For teams ready to scale voice operations.',
    features: ['3,000 minutes / month', '10 active agents', 'Live transcription', 'CRM integrations', 'Priority support'],
    cta: 'Start Growth',
    hi: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'Dedicated infrastructure and custom SLAs.',
    features: ['Unlimited minutes', 'Unlimited agents', 'Custom voice cloning', 'Dedicated account manager', 'SSO & SAML'],
    cta: 'Contact Sales',
    hi: false,
  },
];

function PlanCard({ plan, onCTA }: { plan: (typeof plans)[number]; onCTA?: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        background: plan.hi
          ? 'linear-gradient(160deg, rgba(124,110,250,0.12), rgba(34,211,238,0.05) 100%)'
          : '#0D1422',
        border: plan.hi ? '1px solid rgba(124,110,250,0.45)' : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 18,
        padding: plan.hi ? '34px 28px' : '26px 28px',
        boxShadow: plan.hi ? '0 0 40px rgba(124,110,250,0.15)' : 'none',
        transform: plan.hi ? 'scale(1.04)' : 'none',
      }}
    >
      {plan.hi && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#7C6EFA',
            background: 'rgba(124,110,250,0.12)',
            border: '1px solid rgba(124,110,250,0.25)',
            padding: '3px 11px',
            borderRadius: 9999,
            display: 'inline-block',
            marginBottom: 14,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          MOST POPULAR
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 10, fontFamily: 'var(--font-inter), sans-serif' }}>
        {plan.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontSize: 40,
            fontWeight: 700,
            color: '#F1F5F9',
            letterSpacing: '-0.03em',
          }}
        >
          {plan.price}
        </span>
        <span style={{ fontSize: 14, color: '#3D4F68', fontFamily: 'var(--font-inter), sans-serif' }}>{plan.period}</span>
      </div>
      <div style={{ fontSize: 13, color: '#3D4F68', marginBottom: 22, lineHeight: 1.55, fontFamily: 'var(--font-inter), sans-serif' }}>
        {plan.desc}
      </div>
      <button
        onClick={() => plan.hi && onCTA?.()}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width: '100%',
          background: plan.hi ? (hov ? '#6355E8' : '#7C6EFA') : hov ? 'rgba(255,255,255,0.05)' : 'transparent',
          border: plan.hi ? 'none' : '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10,
          padding: 11,
          fontFamily: 'var(--font-inter), sans-serif',
          fontWeight: 600,
          fontSize: 14,
          color: plan.hi ? '#fff' : '#64748B',
          cursor: 'pointer',
          marginBottom: 22,
          transition: 'all 0.2s',
        }}
      >
        {plan.cta}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {plan.features.map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#4A5568', fontFamily: 'var(--font-inter), sans-serif' }}>
            {checkGreenIcon}
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PricingSection({ onCTA }: { onCTA?: () => void }) {
  return (
    <section id="Pricing" style={{ padding: '100px 80px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 60 }}>
        <SectionLabel>Pricing</SectionLabel>
        <SectionHeading sub="Simple, transparent pricing. No per-seat fees. No hidden costs.">
          The right plan for every team
        </SectionHeading>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, alignItems: 'center' }}>
        {plans.map((p) => (
          <PlanCard key={p.name} plan={p} onCTA={onCTA} />
        ))}
      </div>
    </section>
  );
}

// ─── Social Proof ─────────────────────────────────────────────────────────────

const trustedBy = ['Acme Corp', 'ShopBase', 'NexaRetail', 'SwiftCare', 'Launchpad', 'Orion AI'];

export function SocialProof() {
  return (
    <div
      style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '18px 80px',
        background: 'rgba(6,9,16,0.8)',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 56,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: '#1E293B',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          TRUSTED BY TEAMS AT
        </span>
        {trustedBy.map((n) => (
          <span
            key={n}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#1E293B',
              letterSpacing: '0.02em',
              fontFamily: 'var(--font-space-grotesk), sans-serif',
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── CTA Section ──────────────────────────────────────────────────────────────

export function CTASection({ onCTA }: { onCTA?: () => void }) {
  return (
    <section style={{ padding: '100px 80px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 700,
          height: 500,
          background: 'radial-gradient(ellipse, rgba(124,110,250,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
        <h2
          style={{
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontSize: 54,
            fontWeight: 700,
            letterSpacing: '-0.035em',
            color: '#F1F5F9',
            lineHeight: 1.05,
            marginBottom: 20,
          }}
        >
          Your agent is
          <br />
          <span
            style={{
              background: 'linear-gradient(130deg, #7C6EFA 20%, #22D3EE 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            waiting to work.
          </span>
        </h2>
        <p style={{ fontSize: 17, color: '#3D4F68', marginBottom: 36, lineHeight: 1.65, fontFamily: 'var(--font-inter), sans-serif' }}>
          No engineers needed. Powered by ElevenLabs + Twilio. Go live in under 5 minutes.
        </p>
        <Btn variant="primary" size="lg" onClick={onCTA}>
          Start Building Free — No credit card
        </Btn>
      </div>
    </section>
  );
}
