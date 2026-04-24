'use client';

import { useEffect, useState } from 'react';
import { WaveLogo, Btn } from './shared';

interface NavHeaderProps {
  onNav: (label: string) => void;
}

const navLinks = ['Features', 'How It Works', 'Pricing'];

export function NavHeader({ onNav }: NavHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        height: 64,
        background: scrolled ? 'rgba(8,11,20,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        transition: 'all 0.35s',
        padding: '0 60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <WaveLogo size="md" />
      <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {navLinks.map((l) => (
          <button
            key={l}
            onClick={() => onNav(l)}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#CBD5E1')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 14,
              fontWeight: 500,
              color: '#64748B',
              padding: '8px 14px',
              borderRadius: 8,
              transition: 'color 0.15s',
            }}
          >
            {l}
          </button>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 14,
            fontWeight: 500,
            color: '#64748B',
            padding: '8px 14px',
          }}
        >
          Sign in
        </button>
        <Btn variant="primary" size="sm" onClick={() => onNav('app')}>
          Get Started Free
        </Btn>
      </div>
    </header>
  );
}
