'use client';

import { useEffect, useState } from 'react';
import { Btn } from './shared';

const demoMessages = [
  { role: 'agent', text: "Hi Sarah! Calling from Voxara about your trial — got 2 minutes?" },
  { role: 'user',  text: "Sure, I've been meaning to ask about pricing." },
  { role: 'agent', text: "Of course! Which plan caught your eye — Growth or Starter?" },
  { role: 'user',  text: "The Growth plan looks great actually." },
  { role: 'agent', text: "Awesome! I can lock in a 20% discount if you start today." },
];

// ─── Smooth SVG waveform ──────────────────────────────────────────────────────
function SmoothWaveform({ tick }: { tick: number }) {
  const W = 300;
  const CY = 24;
  const N = 44;
  const phase = tick * 0.065;

  function getPts(amp: number, freq: number, ph: number) {
    return Array.from({ length: N + 1 }, (_, i) => ({
      x: (i / N) * W,
      y: CY + amp * Math.sin((i / N) * Math.PI * 2 * freq + ph + phase),
    }));
  }

  function wavePath(ps: Array<{ x: number; y: number }>): string {
    let d = `M${ps[0].x.toFixed(1)},${ps[0].y.toFixed(1)}`;
    for (let i = 1; i < ps.length; i++) {
      const cx = (ps[i - 1].x + ps[i].x) / 2;
      d += ` C${cx.toFixed(1)},${ps[i - 1].y.toFixed(1)} ${cx.toFixed(1)},${ps[i].y.toFixed(1)} ${ps[i].x.toFixed(1)},${ps[i].y.toFixed(1)}`;
    }
    return d;
  }

  function fillPath(ps: Array<{ x: number; y: number }>): string {
    let d = `M0,48 L${ps[0].x.toFixed(1)},${ps[0].y.toFixed(1)}`;
    for (let i = 1; i < ps.length; i++) {
      const cx = (ps[i - 1].x + ps[i].x) / 2;
      d += ` C${cx.toFixed(1)},${ps[i - 1].y.toFixed(1)} ${cx.toFixed(1)},${ps[i].y.toFixed(1)} ${ps[i].x.toFixed(1)},${ps[i].y.toFixed(1)}`;
    }
    return d + ` L${W},48 Z`;
  }

  const mainPts = getPts(13, 2.2, 0);
  const sub1Pts = getPts(8, 3.1, 1.9);
  const sub2Pts = getPts(5, 4.5, 3.6);

  return (
    <svg width="100%" height="48" viewBox={`0 0 ${W} 48`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="wlg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00D082" stopOpacity="0" />
          <stop offset="15%"  stopColor="#00D082" stopOpacity="1" />
          <stop offset="58%"  stopColor="#00C2B8" stopOpacity="1" />
          <stop offset="85%"  stopColor="#38BDF8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wfg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#00D082" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#00D082" stopOpacity="0" />
        </linearGradient>
        <filter id="wglow" x="-5%" y="-80%" width="110%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={fillPath(mainPts)} fill="url(#wfg)" />
      <path d={wavePath(sub2Pts)} fill="none" stroke="rgba(56,189,248,0.12)" strokeWidth="1" />
      <path d={wavePath(sub1Pts)} fill="none" stroke="rgba(0,194,184,0.22)" strokeWidth="1.4" />
      <path d={wavePath(mainPts)} fill="none" stroke="url(#wlg)" strokeWidth="2.2" strokeLinecap="round" filter="url(#wglow)" />
    </svg>
  );
}

// ─── Animated waveform card ───────────────────────────────────────────────────
function LiveCallCard() {
  const [tick, setTick]     = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [elapsed, setElapsed] = useState(134); // seconds

  useEffect(() => {
    const t = setInterval(() => setTick((p) => p + 1), 75);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((p) => (p + 1) % demoMessages.length), 2800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div
      style={{
        background: 'rgba(9,20,38,0.72)',
        border: '1px solid rgba(0,208,130,0.2)',
        borderRadius: 22,
        padding: '22px 22px 18px',
        width: 360,
        boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 80px rgba(0,208,130,0.07)',
        backdropFilter: 'blur(24px) saturate(170%)',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Top gradient line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent 5%, #00D082 40%, #00C2B8 60%, transparent 95%)',
      }} />
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 120, height: 120,
        background: 'radial-gradient(circle, rgba(0,208,130,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: '#00D082',
            boxShadow: '0 0 12px rgba(0,208,130,0.9)',
            animation: 'pulse 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#00D082', fontFamily: 'var(--font-inter), sans-serif', letterSpacing: '0.04em' }}>
            LIVE CALL
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#334155' }}>
            {mm}:{ss}
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#FF4D6D', opacity: 0.7,
          }} />
        </div>
      </div>

      {/* Agent info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(0,208,130,0.25), rgba(0,194,184,0.15))',
          border: '1px solid rgba(0,208,130,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
        }}>
          🤖
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', fontFamily: 'var(--font-inter), sans-serif' }}>Sales Agent v2</div>
          <div style={{ fontSize: 11, color: '#4A6080', fontFamily: 'var(--font-inter), sans-serif' }}>Calling Sarah M. · +1 (555) 0142</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(0,208,130,0.1)', color: '#00D082',
            border: '1px solid rgba(0,208,130,0.2)',
            fontFamily: 'var(--font-inter), sans-serif',
          }}>
            AI
          </span>
        </div>
      </div>

      {/* Waveform */}
      <div style={{
        height: 48, marginBottom: 14,
        background: 'rgba(6,15,26,0.55)', borderRadius: 10,
        overflow: 'hidden',
      }}>
        <SmoothWaveform tick={tick} />
      </div>

      {/* Transcript bubble */}
      <div style={{
        background: 'rgba(6,15,26,0.8)',
        borderRadius: 12, padding: '12px 14px',
        marginBottom: 12, minHeight: 82,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        border: '1px solid rgba(0,208,130,0.08)',
      }}>
        {demoMessages.slice(0, msgIdx + 1).slice(-2).map((m, i) => (
          <div key={`${msgIdx}-${i}`} style={{ display: 'flex', gap: 8, marginBottom: i < 1 ? 7 : 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-inter), sans-serif',
              color: m.role === 'agent' ? '#00D082' : '#38BDF8',
              minWidth: 36, paddingTop: 2, letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {m.role === 'agent' ? 'Agent' : 'User'}
            </span>
            <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-inter), sans-serif', lineHeight: 1.5 }}>
              {m.text}
            </span>
          </div>
        ))}
      </div>

      {/* Status tags */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {[
          { label: '● Transcribing',   color: '#00D082', bg: 'rgba(0,208,130,0.08)'  },
          { label: '◎ CRM Syncing',    color: '#38BDF8', bg: 'rgba(56,189,248,0.08)' },
          { label: '↑ Pos. Sentiment', color: '#00C2B8', bg: 'rgba(0,194,184,0.08)'  },
        ].map(({ label, color, bg }) => (
          <span key={label} style={{
            fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
            background: bg, color,
            border: `1px solid ${color}30`,
            fontFamily: 'var(--font-inter), sans-serif', letterSpacing: '0.02em',
          }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Floating metrics mini-card ───────────────────────────────────────────────
function MetricsCard() {
  const [count, setCount] = useState(847);

  useEffect(() => {
    const t = setInterval(() => setCount((p) => p + Math.floor(Math.random() * 3)), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      background: 'rgba(9,20,38,0.80)',
      border: '1px solid rgba(0,208,130,0.15)',
      borderRadius: 16, padding: '16px 18px',
      backdropFilter: 'blur(20px) saturate(160%)',
      boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,208,130,0.4), transparent)',
      }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: '#4A6080', marginBottom: 10, fontFamily: 'var(--font-inter), sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Today's Calls
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          { label: 'Completed', value: count.toString(), color: '#00D082' },
          { label: 'Converted', value: '312',            color: '#38BDF8' },
          { label: 'Avg Score', value: '8.4',            color: '#00C2B8' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 22, fontWeight: 600, color, marginBottom: 3 }}>
              {value}
            </div>
            <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-inter), sans-serif' }}>{label}</div>
          </div>
        ))}
      </div>
      {/* Mini bar chart */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, marginTop: 12 }}>
        {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: 3,
            background: i === 5
              ? 'linear-gradient(180deg, #00D082, #00C2B8)'
              : `rgba(0,208,130,${0.15 + i * 0.04})`,
            height: `${h}%`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────
const stats = [
  { n: '1M+',    l: 'Calls handled',  color: '#00D082' },
  { n: '< 5 min',l: 'To go live',     color: '#38BDF8' },
  { n: '99.9%',  l: 'Uptime SLA',     color: '#00C2B8' },
];

// ─── Hero Section ─────────────────────────────────────────────────────────────
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
      {/* ── Background layers ── */}

      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(0,208,130,0.18) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        pointerEvents: 'none',
      }} />

      {/* Primary large aurora — center-right */}
      <div style={{
        position: 'absolute', top: '-5%', left: '28%',
        width: 1000, height: 800,
        background: 'radial-gradient(ellipse at 40% 40%, rgba(0,208,130,0.14) 0%, rgba(0,194,184,0.08) 35%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      {/* Teal accent — bottom right */}
      <div style={{
        position: 'absolute', bottom: '5%', right: '5%',
        width: 600, height: 500,
        background: 'radial-gradient(ellipse, rgba(56,189,248,0.10) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      {/* Subtle green — top left */}
      <div style={{
        position: 'absolute', top: '15%', left: '-5%',
        width: 400, height: 400,
        background: 'radial-gradient(ellipse, rgba(0,208,130,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      {/* Horizontal glow stripe */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent 0%, rgba(0,208,130,0.06) 30%, rgba(0,194,184,0.04) 70%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Content ── */}
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 64,
        width: '100%',
        position: 'relative',
      }}>

        {/* ── Left: copy ── */}
        <div style={{ maxWidth: 560, flexShrink: 0 }}>

          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 9999,
            background: 'rgba(0,208,130,0.07)',
            border: '1px solid rgba(0,208,130,0.22)',
            marginBottom: 30,
            animation: 'fade-in 0.5s both',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: '#00D082',
              boxShadow: '0 0 8px rgba(0,208,130,0.9)',
              animation: 'pulse 2s infinite',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#00D082',
              letterSpacing: '0.1em', fontFamily: 'var(--font-inter), sans-serif',
            }}>
              NOW IN PUBLIC BETA
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: 'var(--font-syne), sans-serif',
            fontSize: 70, fontWeight: 800,
            lineHeight: 1.0, letterSpacing: '-0.04em',
            color: '#0F172A', marginBottom: 24,
            animation: 'fade-in 0.6s 0.1s both',
          }}>
            Voice agents
            <br />
            <span style={{
              background: 'linear-gradient(125deg, #00D082 10%, #00C2B8 55%, #38BDF8 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              that close deals.
            </span>
          </h1>

          {/* Body */}
          <p style={{
            fontSize: 18, lineHeight: 1.72, color: '#64748B',
            marginBottom: 38, maxWidth: 450,
            fontFamily: 'var(--font-inter), sans-serif', fontWeight: 400,
            animation: 'fade-in 0.6s 0.2s both',
          }}>
            Build AI voice agents that make and receive calls for your business.
            No engineers. No call center. Live in minutes.
          </p>

          {/* CTA buttons */}
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center',
            marginBottom: 52,
            animation: 'fade-in 0.6s 0.3s both',
          }}>
            <Btn variant="primary" size="lg" onClick={onCTA}>
              Start Building Free
            </Btn>
            <Btn variant="secondary" size="lg">
              Watch Demo →
            </Btn>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: 0,
            animation: 'fade-in 0.6s 0.4s both',
          }}>
            {stats.map(({ n, l, color }, idx) => (
              <div key={l} style={{
                paddingRight: idx < stats.length - 1 ? 32 : 0,
                marginRight: idx < stats.length - 1 ? 32 : 0,
                borderRight: idx < stats.length - 1 ? '1px solid #E2E8F0' : 'none',
              }}>
                <div style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 22, fontWeight: 600, color,
                  letterSpacing: '-0.02em', lineHeight: 1,
                }}>
                  {n}
                </div>
                <div style={{
                  fontSize: 12, color: '#64748B', marginTop: 5,
                  fontFamily: 'var(--font-inter), sans-serif',
                }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: stacked cards ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 14,
          flexShrink: 0,
          animation: 'slide-in-right 0.7s 0.15s both',
        }}>
          <LiveCallCard />
          <MetricsCard />
        </div>
      </div>
    </section>
  );
}
