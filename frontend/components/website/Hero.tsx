'use client';

import { useEffect, useState } from 'react';
import { Btn } from './shared';

const demoMessages = [
  { role: 'agent', text: "Hi Sarah! Calling from Voxara about your trial — got 2 minutes?" },
  { role: 'user',  text: "Sure, I've been meaning to ask about pricing." },
  { role: 'agent', text: "Of course! Which plan caught your eye — Growth or Starter?" },
];

function LiveDemo() {
  const [tick, setTick]     = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((p) => p + 1), 80);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((p) => (p + 1) % demoMessages.length), 3200);
    return () => clearInterval(t);
  }, []);

  const bars = Array.from({ length: 32 }, (_, i) =>
    4 + Math.floor(Math.abs(Math.sin(i * 0.7 + tick * 0.08)) * 36),
  );

  return (
    <div
      style={{
        background: '#0D1422',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: 22,
        width: 360,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        flexShrink: 0,
      }}
    >
      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 8px #10B981',
              animation: 'pulse 1.8s infinite',
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: 'var(--font-inter), sans-serif' }}>
            Live Call
          </span>
        </div>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#334155', fontWeight: 500 }}>
          02:14
        </span>
      </div>

      {/* Waveform */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: 52, marginBottom: 18, padding: '0 2px' }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 2,
              background: i % 5 === 0 ? '#22D3EE' : '#7C6EFA',
              height: Math.max(3, h),
              opacity: 0.3 + 0.7 * ((h - 4) / 36),
              transition: 'height 0.08s, opacity 0.08s',
            }}
          />
        ))}
      </div>

      {/* Transcript */}
      <div
        style={{
          background: '#080B14',
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
          minHeight: 90,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {demoMessages.slice(0, msgIdx + 1).slice(-2).map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < 1 ? 8 : 0 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-inter), sans-serif',
                color: m.role === 'agent' ? '#7C6EFA' : '#22D3EE',
                minWidth: 40,
                paddingTop: 2,
              }}
            >
              {m.role === 'agent' ? 'Agent' : 'User'}
            </span>
            <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-inter), sans-serif', lineHeight: 1.55 }}>
              {m.text}
            </span>
          </div>
        ))}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['Transcribing', 'CRM Syncing', 'Pos. Sentiment'].map((label, i) => (
          <span
            key={label}
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '3px 9px',
              borderRadius: 9999,
              background: ['rgba(124,110,250,0.12)', 'rgba(34,211,238,0.1)', 'rgba(16,185,129,0.1)'][i],
              color: ['#A89AF9', '#22D3EE', '#10B981'][i],
              border: `1px solid ${['rgba(124,110,250,0.2)', 'rgba(34,211,238,0.18)', 'rgba(16,185,129,0.18)'][i]}`,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const stats = [
  ['1M+',    'Calls handled'],
  ['< 5 min','To go live'],
  ['99.9%',  'Uptime SLA'],
];

export function HeroSection({ onCTA }: { onCTA: () => void }) {
  return (
    <section
      id="hero"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        padding: '120px 80px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background effects */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '35%',
          width: 800,
          height: 600,
          background: 'radial-gradient(ellipse, rgba(124,110,250,0.09) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '60%',
          right: '10%',
          width: 400,
          height: 400,
          background: 'radial-gradient(ellipse, rgba(34,211,238,0.05) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 60,
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Left copy */}
        <div style={{ maxWidth: 580 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 14px',
              borderRadius: 9999,
              background: 'rgba(124,110,250,0.09)',
              border: '1px solid rgba(124,110,250,0.22)',
              marginBottom: 28,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C6EFA', animation: 'pulse 2s infinite' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#8B74F7',
                letterSpacing: '0.07em',
                fontFamily: 'var(--font-inter), sans-serif',
              }}
            >
              NOW IN PUBLIC BETA
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-space-grotesk), sans-serif',
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: '-0.035em',
              color: '#F1F5F9',
              marginBottom: 22,
            }}
          >
            Voice agents
            <br />
            <span
              style={{
                background: 'linear-gradient(130deg, #7C6EFA 20%, #22D3EE 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              that close deals.
            </span>
          </h1>

          <p
            style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: '#4A5568',
              marginBottom: 36,
              maxWidth: 460,
              fontFamily: 'var(--font-inter), sans-serif',
              fontWeight: 400,
            }}
          >
            Build AI voice agents that make and receive calls for your business. No engineers. No call center. Live in
            minutes.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 40 }}>
            <Btn variant="primary" size="lg" onClick={onCTA}>
              Start Building Free
            </Btn>
            <Btn variant="secondary" size="lg">
              Watch Demo →
            </Btn>
          </div>

          <div style={{ display: 'flex', gap: 32 }}>
            {stats.map(([n, l]) => (
              <div key={l}>
                <div
                  style={{
                    fontFamily: 'var(--font-space-grotesk), sans-serif',
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#F1F5F9',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {n}
                </div>
                <div style={{ fontSize: 12, color: '#334155', marginTop: 2, fontFamily: 'var(--font-inter), sans-serif' }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: live demo card */}
        <LiveDemo />
      </div>
    </section>
  );
}
