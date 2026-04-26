'use client';

import { useState } from 'react';

// ─── Wave Logo ───────────────────────────────────────────────────────────────

type LogoSize = 'sm' | 'md' | 'lg';

const logoSizes: Record<LogoSize, { bar: number; heights: number[]; gap: number; fs: number }> = {
  sm: { bar: 2.5, heights: [7, 13, 20, 13, 7],  gap: 2, fs: 16 },
  md: { bar: 3,   heights: [10, 18, 28, 18, 10], gap: 3, fs: 22 },
  lg: { bar: 4,   heights: [14, 24, 38, 24, 14], gap: 4, fs: 30 },
};

const barOpacities = [0.45, 0.7, 1, 0.7, 0.45];

export function WaveLogo({ size = 'md' as LogoSize }: { size?: LogoSize }) {
  const s = logoSizes[size];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', gap: s.gap, alignItems: 'center' }}>
        {s.heights.map((h, i) => (
          <div
            key={i}
            style={{
              width: s.bar,
              height: h,
              background: '#00D082',
              borderRadius: 2,
              opacity: barOpacities[i],
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-syne), sans-serif',
          fontWeight: 800,
          fontSize: s.fs,
          color: '#F1F5F9',
          letterSpacing: '-0.04em',
          lineHeight: 1,
        }}
      >
        voxara
      </span>
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}

const btnVariants: Record<BtnVariant, React.CSSProperties> = {
  primary:   { background: 'linear-gradient(135deg, #00D082 0%, #00C2B8 100%)', color: '#060F1A', boxShadow: '0 0 24px rgba(0,208,130,0.4)', border: 'none' },
  secondary: { background: 'rgba(9,20,38,0.65)', color: '#CBD5E1', border: '1px solid rgba(0,208,130,0.25)', backdropFilter: 'blur(12px)' },
  ghost:     { background: 'transparent', color: '#64748B', border: '1px solid transparent' },
};

const btnHover: Record<BtnVariant, React.CSSProperties> = {
  primary:   { background: 'linear-gradient(135deg, #00E890 0%, #00D4C8 100%)', transform: 'translateY(-2px)', boxShadow: '0 8px 32px rgba(0,208,130,0.55)' },
  secondary: { borderColor: 'rgba(0,208,130,0.5)', color: '#F1F5F9', background: 'rgba(0,208,130,0.08)' },
  ghost:     { color: '#F1F5F9', background: 'rgba(255,255,255,0.04)' },
};

const btnSizes: Record<BtnSize, React.CSSProperties> = {
  sm: { padding: '7px 16px',  fontSize: 13, borderRadius: 10 },
  md: { padding: '11px 22px', fontSize: 14, borderRadius: 10 },
  lg: { padding: '14px 32px', fontSize: 15, borderRadius: 12 },
};

export function Btn({ children, variant = 'primary', size = 'md', onClick, style: extStyle, disabled }: BtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-inter), sans-serif',
        fontWeight: 700,
        transition: 'all 0.25s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        letterSpacing: '0.01em',
        ...btnVariants[variant],
        ...btnSizes[size],
        ...(hov && !disabled ? btnHover[variant] : {}),
        ...extStyle,
      }}
    >
      {children}
    </button>
  );
}

// ─── Section helpers ─────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#00D082',
        marginBottom: 14,
        fontFamily: 'var(--font-inter), sans-serif',
      }}
    >
      {children}
    </div>
  );
}

export function SectionHeading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: sub ? 16 : 0 }}>
      <h2
        style={{
          fontFamily: 'var(--font-syne), sans-serif',
          fontSize: 46,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: '#F1F5F9',
          lineHeight: 1.08,
          marginBottom: sub ? 14 : 0,
        }}
      >
        {children}
      </h2>
      {sub && (
        <p
          style={{
            fontSize: 17,
            color: '#4A6080',
            maxWidth: 520,
            lineHeight: 1.65,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
