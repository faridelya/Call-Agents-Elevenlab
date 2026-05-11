'use client';

import { useState } from 'react';
import { SectionLabel, SectionHeading, Btn } from './shared';

const checkGreenIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D082" strokeWidth="2.5" strokeLinecap="round">
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
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: plan.hi ? '#F0FDF4' : '#FFFFFF',
        border: plan.hi
          ? '1px solid rgba(0,208,130,0.45)'
          : `1px solid ${hov ? 'rgba(0,208,130,0.25)' : '#E2E8F0'}`,
        borderRadius: 18,
        padding: plan.hi ? '34px 28px' : '26px 28px',
        boxShadow: plan.hi
          ? '0 0 48px rgba(0,208,130,0.10), 0 8px 24px rgba(15,23,42,0.08)'
          : hov ? '0 8px 24px rgba(15,23,42,0.08)' : '0 1px 4px rgba(15,23,42,0.06)',
        transform: plan.hi ? 'scale(1.04)' : hov ? 'translateY(-2px)' : 'none',
        transition: 'all 0.3s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {plan.hi && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #00D082, #00C2B8, transparent)',
        }} />
      )}
      {plan.hi && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#00D082',
            background: 'rgba(0,208,130,0.1)',
            border: '1px solid rgba(0,208,130,0.28)',
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
      <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6080', marginBottom: 10, fontFamily: 'var(--font-inter), sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {plan.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 40,
            fontWeight: 600,
            color: plan.hi ? '#00D082' : '#0F172A',
            letterSpacing: '-0.03em',
          }}
        >
          {plan.price}
        </span>
        <span style={{ fontSize: 14, color: '#94A3B8', fontFamily: 'var(--font-inter), sans-serif' }}>{plan.period}</span>
      </div>
      <div style={{ fontSize: 13, color: '#4A6080', marginBottom: 22, lineHeight: 1.55, fontFamily: 'var(--font-inter), sans-serif' }}>
        {plan.desc}
      </div>
      <button
        onClick={() => onCTA?.()}
        style={{
          width: '100%',
          background: plan.hi
            ? 'linear-gradient(135deg, #00D082, #00C2B8)'
            : hov ? 'rgba(0,208,130,0.06)' : 'transparent',
          border: plan.hi ? 'none' : '1px solid rgba(0,208,130,0.2)',
          borderRadius: 10,
          padding: 11,
          fontFamily: 'var(--font-inter), sans-serif',
          fontWeight: 700,
          fontSize: 14,
          color: plan.hi ? '#060F1A' : '#334155',
          cursor: 'pointer',
          marginBottom: 22,
          transition: 'all 0.25s',
          boxShadow: plan.hi ? '0 4px 20px rgba(0,208,130,0.35)' : 'none',
        }}
      >
        {plan.cta}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {plan.features.map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#64748B', fontFamily: 'var(--font-inter), sans-serif' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'center' }}>
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
        borderTop: '1px solid #E2E8F0',
        borderBottom: '1px solid #E2E8F0',
        padding: '18px 80px',
        background: '#F1F5F9',
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
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#94A3B8',
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
              color: '#334155',
              letterSpacing: '0.02em',
              fontFamily: 'var(--font-inter), sans-serif',
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
      {/* Green aurora */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 800,
          height: 500,
          background: 'radial-gradient(ellipse, rgba(0,208,130,0.07) 0%, rgba(0,194,184,0.04) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(0,208,130,0.18) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
        <h2
          style={{
            fontFamily: 'var(--font-syne), sans-serif',
            fontSize: 54,
            fontWeight: 800,
            letterSpacing: '-0.035em',
            color: '#0F172A',
            lineHeight: 1.05,
            marginBottom: 20,
          }}
        >
          Your agent is
          <br />
          <span
            style={{
              background: 'linear-gradient(130deg, #00D082 20%, #00C2B8 60%, #38BDF8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            waiting to work.
          </span>
        </h2>
        <p style={{ fontSize: 17, color: '#64748B', marginBottom: 36, lineHeight: 1.65, fontFamily: 'var(--font-inter), sans-serif' }}>
          No engineers needed. Powered by ElevenLabs + Twilio. Go live in under 5 minutes.
        </p>
        <Btn variant="primary" size="lg" onClick={onCTA}>
          Start Building Free — No credit card
        </Btn>
      </div>
    </section>
  );
}
