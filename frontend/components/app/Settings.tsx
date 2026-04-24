'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useUsage } from '@/lib/hooks/useAnalytics';

export function SettingsView() {
  const { user, logout } = useAuth();
  const { data: usage }  = useUsage();

  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  const tierLabel = user?.subscription_tier
    ? user.subscription_tier.charAt(0).toUpperCase() + user.subscription_tier.slice(1)
    : 'Free';

  const rows = [
    {
      section: 'Workspace',
      fields: [
        ['Name',  user?.full_name ?? '—'],
        ['Email', user?.email ?? '—'],
        ['Company', user?.company_name ?? '—'],
      ],
    },
    {
      section: 'Voice Infrastructure',
      fields: [
        ['AI Voice Engine',   'ElevenLabs · Turbo v2.5'],
        ['Telephony Provider','Twilio'],
        ['Transcription',     'Voxara Native (real-time)'],
      ],
    },
    {
      section: 'Billing & Usage',
      fields: [
        ['Current plan', `${tierLabel} plan`],
        ['Total calls',  (usage?.total_calls ?? 0).toLocaleString()],
        ['Total minutes', `${usage?.total_minutes ?? 0} min`],
      ],
    },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 660 }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', marginBottom: 24 }}>
        Settings
      </h1>

      {rows.map(({ section, fields }) => (
        <div key={section} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#1E293B', marginBottom: 10 }}>
            {section}
          </div>
          <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
            {fields.map(([k, v], i) => (
              <div
                key={k}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderBottom: i < fields.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
              >
                <span style={{ fontSize: 13, color: '#475569' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#CBD5E1' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Danger zone */}
      <div style={{ marginTop: 32, padding: 18, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', marginBottom: 12 }}>Session</div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ padding: '8px 18px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-inter)', opacity: loggingOut ? 0.6 : 1 }}
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
