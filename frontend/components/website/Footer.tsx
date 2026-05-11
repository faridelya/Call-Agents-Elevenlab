'use client';

import { WaveLogo } from './shared';

const footerColumns = [
  ['Product',   'Features', 'Pricing', 'Changelog', 'Roadmap'],
  ['Developers','Docs', 'API Reference', 'SDKs', 'Status'],
  ['Company',   'About', 'Blog', 'Careers', 'Privacy'],
];

export function SiteFooter() {
  return (
    <footer
      style={{
        background: '#F1F5F9',
        borderTop: '1px solid #E2E8F0',
        padding: '64px 80px 40px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: 48,
            marginBottom: 56,
          }}
        >
          <div>
            <WaveLogo size="md" />
            <p
              style={{
                marginTop: 14,
                fontSize: 13,
                color: '#64748B',
                lineHeight: 1.7,
                maxWidth: 240,
                fontFamily: 'var(--font-inter), sans-serif',
              }}
            >
              The AI voice agent platform for businesses that move fast.
            </p>
          </div>
          {footerColumns.map(([title, ...links]) => (
            <div key={title}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#00D082',
                  marginBottom: 16,
                  opacity: 0.6,
                  fontFamily: 'var(--font-syne), sans-serif',
                }}
              >
                {title}
              </div>
              {links.map((l) => (
                <div
                  key={l}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#00D082')}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#64748B')}
                  style={{
                    fontSize: 13,
                    color: '#64748B',
                    marginBottom: 10,
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                    fontFamily: 'var(--font-inter), sans-serif',
                  }}
                >
                  {l}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            borderTop: '1px solid #E2E8F0',
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-inter), sans-serif' }}>© 2025 Voxara, Inc.</span>
          <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-inter), sans-serif' }}>Built for builders.</span>
        </div>
      </div>
    </footer>
  );
}
