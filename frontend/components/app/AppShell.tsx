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
        width: 36, height: 36, borderRadius: 12,
        background: 'linear-gradient(135deg, #F43F5E 0%, #F97316 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(244,63,94,0.30)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
          {[3, 7, 12, 7, 3].map((h, i) => (
            <div key={i} style={{
              width: 2.5, height: h,
              background: i === 2 ? '#fff' : 'rgba(255,255,255,0.65)',
              borderRadius: 2,
            }} />
          ))}
        </div>
      </div>
      <div>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17,
          color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1,
        }}>
          voxara
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: '#94A3B8', textTransform: 'uppercase', marginTop: 1,
        }}>
          console
        </div>
      </div>
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
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-page)', overflow: 'hidden' }}>
      <style>{`
        @keyframes nav-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.55)} }
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes shimmer  { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        @keyframes fade-in  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin-cw  { to{transform:rotate(360deg)} }
        @keyframes bar-wave { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
        @keyframes modal-in { from{opacity:0;transform:scale(0.96) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes slide-in-right { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scale-in { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
        @keyframes live-ring { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)} 50%{box-shadow:0 0 0 4px rgba(16,185,129,0)} }
      `}</style>

      {/* Sidebar */}
      <div style={{
        width: 228,
        background: '#FFFFFF',
        borderRight: '1px solid #E2E8F0',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        position: 'relative',
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid #F1F5F9',
        }}>
          <AppLogo />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
          {navItems.map((item) => (
            <div key={item.id}>
              {groupBreaks.has(item.id) && (
                <div style={{
                  height: 1, background: '#F1F5F9',
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
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 10, border: 'none',
        cursor: 'pointer', marginBottom: 2, position: 'relative',
        background: active ? '#F1F5F9' : hov ? '#F8FAFC' : 'transparent',
        color: active ? '#0F172A' : hov ? '#334155' : '#64748B',
        fontSize: 13.5, fontWeight: active ? 600 : 500,
        textAlign: 'left', transition: 'all 0.15s ease',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', transition: 'color 0.15s',
        color: active ? '#0F172A' : hov ? '#475569' : '#94A3B8',
      }}>
        <Icon d={item.icon} size={15} color="currentColor" strokeWidth={active ? 2 : 1.75} />
      </span>

      <span style={{ flex: 1 }}>{item.label}</span>

      {active && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#10B981',
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

  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={() => onNav('settings')}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '12px 14px',
        borderTop: '1px solid #F1F5F9',
        cursor: 'pointer',
        background: hov ? '#F8FAFC' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg, #F43F5E 0%, #F97316 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
          boxShadow: '0 2px 8px rgba(244,63,94,0.25)',
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: '#0F172A',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {user?.full_name ?? 'Loading…'}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{tier}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </div>
  );
}
