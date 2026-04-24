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
        background: '#060910',
        borderTop: '1px solid rgba(255,255,255,0.06)',
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
                color: '#334155',
                lineHeight: 1.7,
                maxWidth: 240,
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
                  fontWeight: 600,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: '#2D3748',
                  marginBottom: 16,
                }}
              >
                {title}
              </div>
              {links.map((l) => (
                <div
                  key={l}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#64748B')}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#334155')}
                  style={{
                    fontSize: 13,
                    color: '#334155',
                    marginBottom: 10,
                    cursor: 'pointer',
                    transition: 'color 0.15s',
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
            borderTop: '1px solid rgba(255,255,255,0.05)',
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: '#1E293B' }}>© 2025 Voxara, Inc.</span>
          <span style={{ fontSize: 12, color: '#1E293B' }}>Built for builders.</span>
        </div>
      </div>
    </footer>
  );
}
