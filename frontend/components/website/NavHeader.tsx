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
        background: scrolled ? 'rgba(6,15,26,0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(24px) saturate(160%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(0,208,130,0.12)' : '1px solid transparent',
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
            onMouseEnter={(e) => (e.currentTarget.style.color = '#00D082')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4A6080')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 14,
              fontWeight: 500,
              color: '#4A6080',
              padding: '8px 14px',
              borderRadius: 8,
              transition: 'color 0.2s',
            }}
          >
            {l}
          </button>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => onNav('app')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#00D082')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#4A6080')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 14,
            fontWeight: 500,
            color: '#4A6080',
            padding: '8px 14px',
            transition: 'color 0.2s',
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
