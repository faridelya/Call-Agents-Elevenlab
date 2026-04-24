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
              background: '#7C6EFA',
              borderRadius: 2,
              opacity: barOpacities[i],
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-space-grotesk), sans-serif',
          fontWeight: 700,
          fontSize: s.fs,
          color: '#F1F5F9',
          letterSpacing: '-0.03em',
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
  primary:   { background: '#7C6EFA', color: '#fff', boxShadow: '0 0 20px rgba(124,110,250,0.35)', border: 'none' },
  secondary: { background: 'transparent', color: '#CBD5E1', border: '1px solid rgba(255,255,255,0.13)' },
  ghost:     { background: 'transparent', color: '#64748B', border: '1px solid transparent' },
};

const btnHover: Record<BtnVariant, React.CSSProperties> = {
  primary:   { background: '#6355E8', transform: 'translateY(-1px)', boxShadow: '0 4px 24px rgba(124,110,250,0.4)' },
  secondary: { borderColor: 'rgba(255,255,255,0.28)', color: '#F1F5F9', background: 'rgba(255,255,255,0.04)' },
  ghost:     { color: '#F1F5F9', background: 'rgba(255,255,255,0.04)' },
};

const btnSizes: Record<BtnSize, React.CSSProperties> = {
  sm: { padding: '7px 16px',  fontSize: 13, borderRadius: 10 },
  md: { padding: '11px 22px', fontSize: 14, borderRadius: 10 },
  lg: { padding: '14px 32px', fontSize: 16, borderRadius: 12 },
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
        fontWeight: 600,
        transition: 'all 0.2s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
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
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#334155',
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
          fontFamily: 'var(--font-space-grotesk), sans-serif',
          fontSize: 46,
          fontWeight: 700,
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
            color: '#3D4F68',
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
