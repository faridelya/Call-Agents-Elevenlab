'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';

// ─── Icon ─────────────────────────────────────────────────────────────────────
export function Icon({ d, size = 16, color = 'currentColor', strokeWidth = 1.75 }: {
  d: string | string[]; size?: number; color?: string; strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
export function AppLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(0,208,130,0.25) 0%, rgba(0,194,184,0.15) 100%)',
        border: '1px solid rgba(0,208,130,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 20px rgba(0,208,130,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
          {[4, 8, 13, 8, 4].map((h, i) => (
            <div key={i} style={{
              width: 2.5, height: h,
              background: i === 2
                ? 'linear-gradient(to top, #00D082, #00C2B8)'
                : 'rgba(0,208,130,0.55)',
              borderRadius: 2,
            }} />
          ))}
        </div>
      </div>
      <span style={{
        fontFamily: 'var(--font-syne), sans-serif',
        fontWeight: 800, fontSize: 18,
        color: '#DFF0FF', letterSpacing: '-0.02em',
      }}>
        voxara
      </span>
    </div>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────
export const navItems = [
  { id: 'dashboard',  label: 'Dashboard',  icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { id: 'agents',     label: 'Agents',     icon: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2' },
  { id: 'campaigns',  label: 'Campaigns',  icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' },
  { id: 'calls',      label: 'Call Logs',  icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { id: 'analytics',  label: 'Analytics',  icon: 'M18 20V10M12 20V4M6 20v-6' },
  { id: 'orders',     label: 'Orders',     icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4' },
  { id: 'settings',   label: 'Settings',   icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
];

const groupBreaks = new Set(['analytics', 'settings']);

// ─── AppShell ─────────────────────────────────────────────────────────────────
export function AppShell({ activeView, onNav, children }: {
  activeView: string; onNav: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <style>{`
        @keyframes nav-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.55)} }
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes shimmer  { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        @keyframes fade-in  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin-cw  { to{transform:rotate(360deg)} }
        @keyframes bar-wave { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 10px rgba(0,208,130,0.25)} 50%{box-shadow:0 0 22px rgba(0,208,130,0.50)} }
        @keyframes modal-in { from{opacity:0;transform:scale(0.96) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes slide-in-right { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scale-in { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
        @keyframes orb-pulse{ 0%,100%{opacity:0.8;transform:scale(1)} 50%{opacity:1;transform:scale(1.1)} }
      `}</style>

      {/* Sidebar */}
      <div style={{
        width: 220,
        background: 'linear-gradient(180deg, rgba(6,15,26,0.98) 0%, rgba(4,10,18,0.99) 100%)',
        borderRight: '1px solid rgba(0,208,130,0.08)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Top green haze */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 200,
          background: 'radial-gradient(ellipse 140% 120% at 50% -10%, rgba(0,208,130,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        {/* Bottom teal haze */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 140,
          background: 'radial-gradient(ellipse 100% 80% at 50% 120%, rgba(0,194,184,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        {/* Subtle grid lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(0,208,130,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid rgba(0,208,130,0.07)',
          position: 'relative',
        }}>
          <AppLogo />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', position: 'relative' }}>
          {navItems.map((item) => (
            <div key={item.id}>
              {groupBreaks.has(item.id) && (
                <div style={{
                  height: 1,
                  background: 'linear-gradient(90deg, transparent, rgba(0,208,130,0.08), transparent)',
                  margin: '8px 4px',
                }} />
              )}
              <NavButton item={item} active={activeView === item.id} onNav={onNav} />
            </div>
          ))}
        </nav>

        {/* User badge */}
        <UserBadge onNav={onNav} />
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

function NavButton({ item, active, onNav }: {
  item: typeof navItems[number]; active: boolean; onNav: (id: string) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => onNav(item.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 10px 8px 11px', borderRadius: 8, border: 'none',
        cursor: 'pointer', marginBottom: 1, position: 'relative',
        background: active
          ? 'linear-gradient(90deg, rgba(0,208,130,0.14) 0%, rgba(0,208,130,0.05) 100%)'
          : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        color: active ? '#00D082' : hov ? '#7BA5C8' : '#3D607A',
        fontSize: 12.5, fontWeight: active ? 600 : 500,
        textAlign: 'left', transition: 'all 0.18s var(--ease-out)',
        borderLeft: `2px solid ${active ? '#00D082' : 'transparent'}`,
        fontFamily: 'var(--font-ui)',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', transition: 'filter 0.2s',
        filter: active
          ? 'drop-shadow(0 0 5px rgba(0,208,130,0.8))'
          : hov ? 'drop-shadow(0 0 3px rgba(0,208,130,0.3))' : 'none',
      }}>
        <Icon d={item.icon} size={14} color="currentColor" />
      </span>

      <span style={{ flex: 1 }}>{item.label}</span>

      {active && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: '#00D082',
          boxShadow: '0 0 8px rgba(0,208,130,0.9), 0 0 16px rgba(0,208,130,0.4)',
          animation: 'nav-dot 2.4s ease-in-out infinite', flexShrink: 0,
        }} />
      )}
    </button>
  );
}

function UserBadge({ onNav }: { onNav: (id: string) => void }) {
  const { user } = useAuth();
  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const tier = user?.subscription_tier
    ? user.subscription_tier.charAt(0).toUpperCase() + user.subscription_tier.slice(1) + ' Plan'
    : 'Free Plan';

  return (
    <div
      onClick={() => onNav('settings')}
      style={{
        padding: '11px 13px',
        borderTop: '1px solid rgba(0,208,130,0.07)',
        cursor: 'pointer', transition: 'background 0.15s', position: 'relative',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,208,130,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'linear-gradient(135deg, #00D082, #00C2B8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 800, color: '#020A14', flexShrink: 0,
          boxShadow: '0 0 12px rgba(0,208,130,0.35)',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 600, color: '#7BA5C8',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {user?.full_name ?? 'Loading…'}
          </div>
          <div style={{ fontSize: 9.5, color: '#2D4A60', marginTop: 1 }}>{tier}</div>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2D4A60" strokeWidth="2" strokeLinecap="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </div>
  );
}
