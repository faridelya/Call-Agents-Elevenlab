'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useUsage } from '@/lib/hooks/useAnalytics';
import { settings as settingsApi, type CredentialsData } from '@/lib/api';

// ─── Shared input styles ──────────────────────────────────────────────────────

function CredInput({ value, onChange, placeholder, disabled, accent, type = 'text' }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; accent: string; type?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      spellCheck={false}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${focused ? accent + '55' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 10, padding: '10px 14px',
        fontSize: 13, fontFamily: 'var(--font-jetbrains-mono), monospace',
        color: '#E2E8F0', outline: 'none', letterSpacing: '0.02em',
        boxShadow: focused ? `0 0 0 3px ${accent}18` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function SecretInput({ value, onChange, placeholder, disabled, accent }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; accent: string;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="new-password"
        spellCheck={false}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${focused ? accent + '55' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 10, padding: '10px 42px 10px 14px',
          fontSize: 13, fontFamily: 'var(--font-jetbrains-mono), monospace',
          color: '#E2E8F0', outline: 'none', letterSpacing: '0.04em',
          boxShadow: focused ? `0 0 0 3px ${accent}18` : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          opacity: disabled ? 0.5 : 1,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        disabled={disabled}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
          color: '#475569', display: 'flex', alignItems: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#475569'; }}
      >
        {show ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: '#475569', marginBottom: 7,
      fontFamily: 'var(--font-inter)',
    }}>
      {children}
    </label>
  );
}

// ─── Save button ──────────────────────────────────────────────────────────────

function SaveBtn({ onSave, saving, saved, disabled, accent }: {
  onSave: () => void; saving: boolean; saved: boolean; disabled?: boolean; accent: string;
}) {
  return (
    <button
      onClick={onSave}
      disabled={saving || disabled}
      style={{
        marginTop: 16, width: '100%', padding: '10px 18px', borderRadius: 10,
        fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600,
        cursor: saving || disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'all 0.2s',
        background: saved
          ? 'rgba(16,185,129,0.12)'
          : saving
          ? 'rgba(255,255,255,0.04)'
          : `${accent}20`,
        border: `1px solid ${saved ? 'rgba(16,185,129,0.3)' : saving ? 'rgba(255,255,255,0.07)' : accent + '45'}`,
        color: saved ? '#10B981' : saving ? '#475569' : accent,
        boxShadow: saved ? '0 0 16px rgba(16,185,129,0.12)' : 'none',
        opacity: (saving || disabled) && !saved ? 0.7 : 1,
      }}
    >
      {saved ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          Saved
        </>
      ) : saving ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin-cw 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Saving…
        </>
      ) : (
        'Save'
      )}
    </button>
  );
}

// ─── Credential card ──────────────────────────────────────────────────────────

interface FieldConfig {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
}

function CredCard({
  title, accent, icon, connected, fields, initValues, onSave,
}: {
  title: string;
  accent: string;
  icon: React.ReactNode;
  connected: boolean;
  fields: FieldConfig[];
  initValues: Record<string, string>;
  onSave: (vals: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValues({});
  }, [initValues]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(values);
      setSaved(true);
      setValues({});
      setTimeout(() => setSaved(false), 2200);
    } finally {
      setSaving(false);
    }
  }

  const hasInput = Object.values(values).some((v) => v.trim().length > 0);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: '22px 22px 20px',
      display: 'flex', flexDirection: 'column', gap: 0,
      position: 'relative', overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}00, ${accent}88, ${accent}00)`, borderRadius: '16px 16px 0 0' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}18`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', fontFamily: 'var(--font-syne), sans-serif', letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: connected ? '#10B981' : '#F59E0B',
              boxShadow: connected ? '0 0 6px rgba(16,185,129,0.7)' : '0 0 6px rgba(245,158,11,0.5)',
              animation: 'orb-pulse 2.2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 10, color: connected ? '#10B981' : '#F59E0B', fontFamily: 'var(--font-inter)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {connected ? 'Connected' : 'Not configured'}
            </span>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {fields.map((f) => (
          <div key={f.key}>
            <FieldLabel>{f.label}</FieldLabel>
            {f.secret ? (
              <SecretInput
                value={values[f.key] ?? ''}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                placeholder={initValues[f.key] || f.placeholder || ''}
                accent={accent}
              />
            ) : (
              <CredInput
                value={values[f.key] ?? ''}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                placeholder={initValues[f.key] || f.placeholder || ''}
                accent={accent}
              />
            )}
          </div>
        ))}
      </div>

      <SaveBtn onSave={handleSave} saving={saving} saved={saved} disabled={!hasInput} accent={accent} />
    </div>
  );
}

// ─── Webhook URL section ──────────────────────────────────────────────────────

function WebhookSection({ webhookBaseUrl }: { webhookBaseUrl: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${webhookBaseUrl}/api/v1/webhooks/twilio/inbound`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  return (
    <div style={{
      marginTop: 24, background: 'rgba(255,255,255,0.015)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: '22px 24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, rgba(34,211,238,0), rgba(34,211,238,0.5), rgba(34,211,238,0))', borderRadius: '16px 16px 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', fontFamily: 'var(--font-syne), sans-serif' }}>Inbound Webhook URL</div>
          <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-inter)', marginTop: 2 }}>Paste this in your Twilio phone number settings</div>
        </div>
      </div>

      {/* URL row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: copied ? 'rgba(16,185,129,0.06)' : 'rgba(0,0,0,0.25)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10, padding: '11px 14px',
        transition: 'all 0.3s',
      }}>
        <span style={{
          flex: 1, fontSize: 12, fontFamily: 'var(--font-jetbrains-mono), monospace',
          color: copied ? '#10B981' : '#94A3B8', letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.3s',
        }}>
          {url}
        </span>
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 7,
            fontFamily: 'var(--font-inter)', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.2s',
            background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: copied ? '#10B981' : '#94A3B8',
            boxShadow: copied ? '0 0 12px rgba(16,185,129,0.15)' : 'none',
          }}
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {[
          { n: 1, text: 'Save your Twilio credentials in the card above' },
          { n: 2, text: 'Twilio Console → Phone Numbers → your number → Voice & Fax → "A call comes in" → Webhook → paste URL → HTTP POST → Save' },
        ].map(({ n, text }) => (
          <div key={n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#22D3EE', fontFamily: 'var(--font-inter)' }}>{n}</span>
            </div>
            <span style={{ fontSize: 12, color: '#64748B', fontFamily: 'var(--font-inter)', lineHeight: 1.6, paddingTop: 2 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ElevenLabs post-call webhook section ─────────────────────────────────────

function ElevenLabsWebhookSection({ webhookBaseUrl, secretMasked, configured }: {
  webhookBaseUrl: string;
  secretMasked: string | null;
  configured: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const url = `${webhookBaseUrl}/api/v1/webhooks/elevenlabs/post-call`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  async function handleSaveSecret() {
    if (!secret.trim()) return;
    setSaving(true);
    try {
      await settingsApi.saveCredentials({ elevenlabs_webhook_secret: secret.trim() });
      setSaved(true);
      setSecret('');
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      marginTop: 16, background: 'rgba(255,255,255,0.015)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: '22px 24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, rgba(168,154,249,0), rgba(168,154,249,0.5), rgba(168,154,249,0))', borderRadius: '16px 16px 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(168,154,249,0.12)', border: '1px solid rgba(168,154,249,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A89AF9" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0V4a2 2 0 0 1 2-2z"/>
            <path d="M19 10a7 7 0 0 1-14 0"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', fontFamily: 'var(--font-syne), sans-serif' }}>ElevenLabs Post-Call Webhook</div>
            <div style={{
              padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: configured ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
              border: `1px solid ${configured ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
              color: configured ? '#10B981' : '#F59E0B',
            }}>
              {configured ? '● Configured' : '● Not configured'}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-inter)', marginTop: 2 }}>Enables automatic transcript &amp; summary saving after every call</div>
        </div>
      </div>

      {/* URL row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: copied ? 'rgba(16,185,129,0.06)' : 'rgba(0,0,0,0.25)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10, padding: '11px 14px',
        transition: 'all 0.3s',
      }}>
        <span style={{
          flex: 1, fontSize: 12, fontFamily: 'var(--font-jetbrains-mono), monospace',
          color: copied ? '#10B981' : '#94A3B8', letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.3s',
        }}>
          {url}
        </span>
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 7,
            fontFamily: 'var(--font-inter)', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.2s',
            background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: copied ? '#10B981' : '#94A3B8',
            boxShadow: copied ? '0 0 12px rgba(16,185,129,0.15)' : 'none',
          }}
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {[
          { n: 1, text: 'Go to elevenlabs.io → Conversational AI → Settings → Post-Call Webhook' },
          { n: 2, text: 'Click "Create Webhook" → paste the URL above → Save' },
          { n: 3, text: 'Copy the signing secret shown → add to your backend/.env as ELEVENLABS_WEBHOOK_SECRET=<secret>' },
          { n: 4, text: 'Restart the backend. Every completed call will now save its transcript and AI summary automatically.' },
        ].map(({ n, text }) => (
          <div key={n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(168,154,249,0.12)', border: '1px solid rgba(168,154,249,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#A89AF9', fontFamily: 'var(--font-inter)' }}>{n}</span>
            </div>
            <span style={{ fontSize: 12, color: '#64748B', fontFamily: 'var(--font-inter)', lineHeight: 1.6, paddingTop: 2 }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Signing secret input */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', fontFamily: 'var(--font-inter)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Signing Secret {secretMasked && <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— current: {secretMasked}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder={secretMasked ? 'Enter new secret to replace…' : 'Paste signing secret from ElevenLabs…'}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '9px 36px 9px 12px',
                fontSize: 12, fontFamily: 'var(--font-jetbrains-mono), monospace',
                color: '#E2E8F0', outline: 'none',
              }}
            />
            <button
              onClick={() => setShowSecret(v => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0 }}
            >
              {showSecret
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
          <button
            onClick={handleSaveSecret}
            disabled={saving || !secret.trim()}
            style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              fontFamily: 'var(--font-inter)', cursor: secret.trim() ? 'pointer' : 'default',
              transition: 'all 0.2s',
              background: saved ? 'rgba(16,185,129,0.15)' : 'rgba(168,154,249,0.15)',
              border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : 'rgba(168,154,249,0.3)'}`,
              color: saved ? '#10B981' : '#A89AF9',
              opacity: (!secret.trim() && !saving) ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Secret'}
          </button>
        </div>
      </div>

      {/* Status badge */}
      <div style={{ marginTop: 14, padding: '8px 12px', background: 'rgba(168,154,249,0.06)', borderRadius: 8, border: '1px solid rgba(168,154,249,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A89AF9" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span style={{ fontSize: 11, color: '#A89AF9', fontFamily: 'var(--font-inter)' }}>
          Without this webhook, transcripts use a background retry (delay equals call duration). With it, transcripts appear within ~20 seconds of call end.
        </span>
      </div>
    </div>
  );
}

// ─── Credentials tab ──────────────────────────────────────────────────────────

function CredentialsTab() {
  const [creds, setCreds] = useState<CredentialsData | null>(null);

  useEffect(() => {
    settingsApi.getCredentials().then(setCreds).catch(() => {});
  }, []);

  async function saveTwilio(vals: Record<string, string>) {
    const body: Record<string, string | null> = {};
    if (vals.account_sid !== undefined) body.twilio_account_sid = vals.account_sid || null;
    if (vals.auth_token !== undefined) body.twilio_auth_token = vals.auth_token || null;
    await settingsApi.saveCredentials(body);
    const updated = await settingsApi.getCredentials();
    setCreds(updated);
  }

  async function saveElevenLabs(vals: Record<string, string>) {
    if (vals.api_key !== undefined) {
      await settingsApi.saveCredentials({ elevenlabs_api_key: vals.api_key || null });
      const updated = await settingsApi.getCredentials();
      setCreds(updated);
    }
  }

  async function saveLLM(vals: Record<string, string>) {
    const body: Record<string, string | null> = {};
    if (vals.openai !== undefined) body.openai_api_key = vals.openai || null;
    if (vals.google !== undefined) body.google_api_key = vals.google || null;
    if (vals.anthropic !== undefined) body.anthropic_api_key = vals.anthropic || null;
    await settingsApi.saveCredentials(body);
    const updated = await settingsApi.getCredentials();
    setCreds(updated);
  }

  const llmConnected = Boolean(
    creds?.openai_api_key_masked || creds?.google_api_key_masked || creds?.anthropic_api_key_masked
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

        {/* ElevenLabs */}
        <CredCard
          title="ElevenLabs"
          accent="#A89AF9"
          connected={Boolean(creds?.elevenlabs_connected)}
          initValues={{ api_key: creds?.elevenlabs_api_key_masked ?? '' }}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A89AF9" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0V4a2 2 0 0 1 2-2z"/>
              <path d="M19 10a7 7 0 0 1-14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          }
          fields={[
            { key: 'api_key', label: 'API Key', secret: true, placeholder: 'sk_...' },
          ]}
          onSave={saveElevenLabs}
        />

        {/* Twilio */}
        <CredCard
          title="Twilio"
          accent="#22D3EE"
          connected={Boolean(creds?.twilio_connected)}
          initValues={{
            account_sid: creds?.twilio_account_sid ?? '',
            auth_token: creds?.twilio_auth_token_masked ?? '',
          }}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          }
          fields={[
            { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
            { key: 'auth_token', label: 'Auth Token', secret: true, placeholder: '••••••••••••••••' },
          ]}
          onSave={saveTwilio}
        />

        {/* AI / LLM */}
        <CredCard
          title="AI / LLM"
          accent="#10B981"
          connected={llmConnected}
          initValues={{
            openai: creds?.openai_api_key_masked ?? '',
            google: creds?.google_api_key_masked ?? '',
            anthropic: creds?.anthropic_api_key_masked ?? '',
          }}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
          }
          fields={[
            { key: 'openai', label: 'OpenAI API Key', secret: true, placeholder: 'sk-...' },
            { key: 'google', label: 'Google Gemini API Key', secret: true, placeholder: 'AIza...' },
            { key: 'anthropic', label: 'Anthropic API Key', secret: true, placeholder: 'sk-ant-...' },
          ]}
          onSave={saveLLM}
        />
      </div>

      {creds && <WebhookSection webhookBaseUrl={creds.webhook_base_url} />}
      {creds && (
        <ElevenLabsWebhookSection
          webhookBaseUrl={creds.webhook_base_url}
          secretMasked={creds.elevenlabs_webhook_secret_masked}
          configured={creds.elevenlabs_webhook_configured}
        />
      )}
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

function AccountTab() {
  const { user, logout } = useAuth();
  const { data: usage } = useUsage();
  const [loggingOut, setLoggingOut] = useState(false);

  const tierLabel = user?.subscription_tier
    ? user.subscription_tier.charAt(0).toUpperCase() + user.subscription_tier.slice(1)
    : 'Free';

  const rows = [
    {
      section: 'Workspace',
      fields: [
        ['Name',    user?.full_name ?? '—'],
        ['Email',   user?.email ?? '—'],
        ['Company', user?.company_name ?? '—'],
      ],
    },
    {
      section: 'Voice Infrastructure',
      fields: [
        ['AI Voice Engine',    'ElevenLabs · Turbo v2.5'],
        ['Telephony Provider', 'Twilio'],
        ['Transcription',      'Voxara Native (real-time)'],
      ],
    },
    {
      section: 'Billing & Usage',
      fields: [
        ['Current plan',  `${tierLabel} plan`],
        ['Total calls',   (usage?.total_calls ?? 0).toLocaleString()],
        ['Total minutes', `${usage?.total_minutes ?? 0} min`],
      ],
    },
  ];

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {rows.map(({ section, fields }) => (
        <div key={section} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', marginBottom: 9, fontFamily: 'var(--font-inter)' }}>
            {section}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
            {fields.map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: i < fields.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span style={{ fontSize: 13, color: '#475569', fontFamily: 'var(--font-inter)' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#CBD5E1', fontFamily: 'var(--font-inter)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 28, padding: '16px 18px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.13)', borderRadius: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 12, fontFamily: 'var(--font-inter)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Session</div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ padding: '8px 18px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 8, color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-inter)', opacity: loggingOut ? 0.6 : 1, transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Settings view ───────────────────────────────────────────────────────

type Tab = 'credentials' | 'account';

const TABS: { id: Tab; label: string }[] = [
  { id: 'credentials', label: 'Credentials' },
  { id: 'account',     label: 'Account' },
];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<Tab>('credentials');

  return (
    <div style={{ padding: '28px 32px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <style>{`
        @keyframes orb-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.65;transform:scale(0.88)} }
        @keyframes spin-cw { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', marginBottom: 6 }}>
        Settings
      </h1>
      <p style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-inter)', marginBottom: 24 }}>
        Manage your API credentials and account details.
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, padding: 3, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11, width: 'fit-content' }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600,
              transition: 'all 0.15s',
              background: activeTab === id ? '#0F1623' : 'transparent',
              color: activeTab === id ? '#F1F5F9' : '#475569',
              boxShadow: activeTab === id ? '0 1px 4px rgba(0,0,0,0.35)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'credentials' && <CredentialsTab />}
      {activeTab === 'account'     && <AccountTab />}
    </div>
  );
}
