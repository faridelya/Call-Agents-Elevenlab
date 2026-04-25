'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';

// ─── Mini SVG icon ────────────────────────────────────────────────────────────

export function Icon({
  d,
  size = 16,
  color = 'currentColor',
  strokeWidth = 2,
}: {
  d: string | string[];
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}

// ─── App logo ─────────────────────────────────────────────────────────────────

export function AppLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 32,
          height: 32,
          background: 'linear-gradient(135deg, rgba(124,110,250,0.3) 0%, rgba(34,211,238,0.15) 100%)',
          borderRadius: 10,
          border: '1px solid rgba(124,110,250,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(124,110,250,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {[4, 8, 13, 8, 4].map((h, i) => (
            <div
              key={i}
              style={{
                width: 2.5,
                height: h,
                background: i === 2
                  ? 'linear-gradient(to top, #7C6EFA, #22D3EE)'
                  : 'rgba(168,154,249,0.7)',
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>
      <span
        style={{
          fontFamily: 'var(--font-syne), sans-serif',
          fontWeight: 800,
          fontSize: 17,
          color: '#F1F5F9',
          letterSpacing: '-0.03em',
        }}
      >
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
  { id: 'tools',      label: 'Tools',      icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { id: 'settings',   label: 'Settings',   icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
];

// Group dividers — show a subtle line before Analytics and Settings
const groupBreaks = new Set(['analytics', 'settings']);

// ─── App shell ────────────────────────────────────────────────────────────────

export function AppShell({
  activeView,
  onNav,
  children,
}: {
  activeView: string;
  onNav: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080B14', overflow: 'hidden' }}>
      <style>{`
        @keyframes nav-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(0.65)} }
        @keyframes nav-glow { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes shimmer  { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      {/* Sidebar */}
      <div
        style={{
          width: 224,
          background: 'linear-gradient(180deg, #0C1225 0%, #090E1C 60%, #080B18 100%)',
          borderRight: '1px solid rgba(255,255,255,0.055)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top violet haze */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 180,
          background: 'radial-gradient(ellipse 120% 100% at 50% -10%, rgba(124,110,250,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        {/* Bottom cyan haze */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
          background: 'radial-gradient(ellipse 100% 80% at 50% 120%, rgba(34,211,238,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
          <AppLogo />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto', position: 'relative' }}>
          {navItems.map((item) => (
            <div key={item.id}>
              {groupBreaks.has(item.id) && (
                <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 4px', borderRadius: 1 }} />
              )}
              <NavButton item={item} active={activeView === item.id} onNav={onNav} />
            </div>
          ))}
        </nav>

        {/* User */}
        <UserBadge onNav={onNav} />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  onNav,
}: {
  item: (typeof navItems)[number];
  active: boolean;
  onNav: (id: string) => void;
}) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={() => onNav(item.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 11px 9px 12px',
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        marginBottom: 2,
        position: 'relative',
        background: active
          ? 'linear-gradient(90deg, rgba(124,110,250,0.16) 0%, rgba(124,110,250,0.05) 100%)'
          : hov
          ? 'rgba(255,255,255,0.04)'
          : 'transparent',
        color: active ? '#C4B8FD' : hov ? '#94A3B8' : '#4A5568',
        fontFamily: 'var(--font-inter), sans-serif',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        textAlign: 'left',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        // Left accent bar
        borderLeft: `2px solid ${active ? '#7C6EFA' : 'transparent'}`,
        letterSpacing: active ? '-0.01em' : '0',
      }}
    >
      {/* Icon with drop-shadow glow when active */}
      <span style={{
        display: 'flex',
        alignItems: 'center',
        transition: 'filter 0.2s',
        filter: active
          ? 'drop-shadow(0 0 5px rgba(124,110,250,0.75))'
          : hov
          ? 'drop-shadow(0 0 3px rgba(124,110,250,0.3))'
          : 'none',
      }}>
        <Icon d={item.icon} size={14} color="currentColor" />
      </span>

      <span style={{ flex: 1 }}>{item.label}</span>

      {/* Active indicator dot */}
      {active && (
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#7C6EFA',
          boxShadow: '0 0 8px rgba(124,110,250,0.9), 0 0 16px rgba(124,110,250,0.4)',
          animation: 'nav-dot 2.4s ease-in-out infinite',
          flexShrink: 0,
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
        padding: '12px 14px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        transition: 'background 0.15s',
        position: 'relative',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(124,110,250,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #7C6EFA, #22D3EE)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
          boxShadow: '0 0 12px rgba(124,110,250,0.35)',
          fontFamily: 'var(--font-inter), sans-serif',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-inter), sans-serif' }}>
            {user?.full_name ?? 'Loading…'}
          </div>
          <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-inter), sans-serif', marginTop: 1 }}>{tier}</div>
        </div>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </div>
  );
}
