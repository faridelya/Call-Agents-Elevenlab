'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useUsage } from '@/lib/hooks/useAnalytics';
import { settings as settingsApi, type CredentialsData, type ElevenLabsCostData } from '@/lib/api';

// ─── Shared inputs ────────────────────────────────────────────────────────────
function CredInput({ value, onChange, placeholder, disabled, accent, type = 'text' }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; accent: string; type?: string;
}) {
  const [foc, setFoc] = useState(false);
  return (
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled} autoComplete="off" spellCheck={false}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${foc ? accent + '55' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 10, padding: '10px 14px',
        fontSize: 13, fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)', outline: 'none', letterSpacing: '0.02em',
        boxShadow: foc ? `0 0 0 3px ${accent}18` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s', opacity: disabled ? 0.5 : 1,
      }}
      onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
    />
  );
}

function SecretInput({ value, onChange, placeholder, disabled, accent }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; accent: string;
}) {
  const [show, setShow] = useState(false);
  const [foc, setFoc] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled} autoComplete="new-password" spellCheck={false}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${foc ? accent + '55' : 'rgba(255,255,255,0.09)'}`,
          borderRadius: 10, padding: '10px 42px 10px 14px',
          fontSize: 13, fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)', outline: 'none', letterSpacing: '0.04em',
          boxShadow: foc ? `0 0 0 3px ${accent}18` : 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s', opacity: disabled ? 0.5 : 1,
        }}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      />
      <button
        type="button" onClick={() => setShow((s) => !s)} disabled={disabled}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
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
      display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 7,
    }}>
      {children}
    </label>
  );
}

function SaveBtn({ onSave, saving, saved, disabled, accent }: {
  onSave: () => void; saving: boolean; saved: boolean; disabled?: boolean; accent: string;
}) {
  return (
    <button
      onClick={onSave} disabled={saving || disabled}
      style={{
        marginTop: 16, width: '100%', padding: '10px 18px', borderRadius: 10,
        fontSize: 13, fontWeight: 600,
        cursor: saving || disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'all 0.2s',
        background: saved ? 'rgba(0,208,130,0.12)' : saving ? 'rgba(255,255,255,0.04)' : `${accent}18`,
        border: `1px solid ${saved ? 'rgba(0,208,130,0.35)' : saving ? 'rgba(255,255,255,0.07)' : accent + '40'}`,
        color: saved ? '#00D082' : saving ? 'var(--text-muted)' : accent,
        boxShadow: saved ? '0 0 16px rgba(0,208,130,0.14)' : 'none',
        opacity: (saving || disabled) && !saved ? 0.65 : 1,
      }}
    >
      {saved ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Saved
        </>
      ) : saving ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ animation: 'spin-cw 0.8s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Saving…
        </>
      ) : 'Save'}
    </button>
  );
}

// ─── Credential card ──────────────────────────────────────────────────────────
interface FieldConfig { key: string; label: string; secret?: boolean; placeholder?: string; }

function CredCard({ title, accent, icon, connected, fields, initValues, onSave, delay = 0 }: {
  title: string; accent: string; icon: React.ReactNode; connected: boolean;
  fields: FieldConfig[]; initValues: Record<string, string>;
  onSave: (vals: Record<string, string>) => Promise<void>; delay?: number;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hov, setHov] = useState(false);

  useEffect(() => { setValues({}); }, [initValues]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(values);
      setSaved(true); setValues({});
      setTimeout(() => setSaved(false), 2200);
    } finally { setSaving(false); }
  }

  const hasInput = Object.values(values).some((v) => v.trim().length > 0);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'rgba(9,20,38,0.60)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: `1px solid ${hov ? `${accent}25` : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 16, padding: '22px 22px 20px',
        display: 'flex', flexDirection: 'column', gap: 0,
        position: 'relative', overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov
          ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${accent}10, inset 0 1px 0 rgba(255,255,255,0.06)`
          : '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'all 0.25s var(--ease-out)',
        animation: `fade-in 0.5s ${delay}ms both`,
      }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${accent}00, ${accent}88, ${accent}00)`,
        borderRadius: '16px 16px 0 0',
      }} />
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 100, height: 100,
        background: `radial-gradient(circle at 100% 0%, ${accent}10 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${accent}18`, border: `1px solid ${accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-syne)', letterSpacing: '-0.01em' }}>
            {title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: connected ? '#00D082' : '#F0B429',
              boxShadow: connected ? '0 0 6px rgba(0,208,130,0.7)' : '0 0 6px rgba(240,180,41,0.6)',
              animation: 'orb-pulse 2.2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: connected ? '#00D082' : '#F0B429',
            }}>
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
                value={values[f.key] ?? ''} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))}
                placeholder={initValues[f.key] || f.placeholder || ''} accent={accent}
              />
            ) : (
              <CredInput
                value={values[f.key] ?? ''} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))}
                placeholder={initValues[f.key] || f.placeholder || ''} accent={accent}
              />
            )}
          </div>
        ))}
      </div>

      <SaveBtn onSave={handleSave} saving={saving} saved={saved} disabled={!hasInput} accent={accent} />
    </div>
  );
}

// ─── Copy URL row ─────────────────────────────────────────────────────────────
function CopyRow({ url, accent }: { url: string; accent: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    });
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: copied ? 'rgba(0,208,130,0.06)' : 'rgba(0,0,0,0.25)',
      border: `1px solid ${copied ? 'rgba(0,208,130,0.30)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 10, padding: '10px 13px', transition: 'all 0.3s',
    }}>
      <span style={{
        flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)',
        color: copied ? '#00D082' : 'var(--text-secondary)', letterSpacing: '0.02em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.3s',
      }}>
        {url}
      </span>
      <button
        onClick={handleCopy}
        style={{
          flexShrink: 0, padding: '4px 10px', borderRadius: 7,
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s',
          background: copied ? 'rgba(0,208,130,0.15)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${copied ? 'rgba(0,208,130,0.40)' : 'rgba(255,255,255,0.10)'}`,
          color: copied ? '#00D082' : 'var(--text-secondary)',
          boxShadow: copied ? '0 0 12px rgba(0,208,130,0.18)' : 'none',
        }}
      >
        {copied ? (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Copied!
          </>
        ) : (
          <>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </>
        )}
      </button>
    </div>
  );
}

// ─── Steps list ───────────────────────────────────────────────────────────────
function StepList({ steps, accent }: { steps: string[]; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
      {steps.map((text, n) => (
        <div key={n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: `${accent}14`, border: `1px solid ${accent}28`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: accent }}>{n + 1}</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, paddingTop: 1 }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Webhook section wrapper ──────────────────────────────────────────────────
function WebhookCard({ title, subtitle, accent, icon, url, steps, extra }: {
  title: string; subtitle: string; accent: string; icon: React.ReactNode;
  url: string; steps: string[]; extra?: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'rgba(9,20,38,0.60)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, padding: '22px 24px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${accent}00, ${accent}70, ${accent}00)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `${accent}14`, border: `1px solid ${accent}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-syne)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <CopyRow url={url} accent={accent} />
      <StepList steps={steps} accent={accent} />
      {extra}
    </div>
  );
}

// ─── Webhook sections ─────────────────────────────────────────────────────────
function WebhookSection({ webhookBaseUrl }: { webhookBaseUrl: string }) {
  return (
    <WebhookCard
      title="Inbound Webhook URL"
      subtitle="Paste this in your Twilio phone number settings"
      accent="#38BDF8"
      url={`${webhookBaseUrl}/api/v1/webhooks/twilio/inbound`}
      icon={
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      }
      steps={[
        'Save your Twilio credentials in the card above',
        'Twilio Console → Phone Numbers → your number → Voice & Fax → "A call comes in" → Webhook → paste URL → HTTP POST → Save',
      ]}
    />
  );
}

function ElevenLabsWebhookSection({ webhookBaseUrl, secretMasked, configured }: {
  webhookBaseUrl: string; secretMasked: string | null; configured: boolean;
}) {
  const [secret, setSecret] = useState('');
  const [showSec, setShowSec] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSaveSecret() {
    if (!secret.trim()) return;
    setSaving(true);
    try {
      await settingsApi.saveCredentials({ elevenlabs_webhook_secret: secret.trim() });
      setSaved(true); setSecret('');
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  return (
    <WebhookCard
      title="ElevenLabs Post-Call Webhook"
      subtitle="Enables automatic transcript & summary saving after every call"
      accent="#00C2B8"
      url={`${webhookBaseUrl}/api/v1/webhooks/elevenlabs/post-call`}
      icon={
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00C2B8" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0V4a2 2 0 0 1 2-2z"/>
          <path d="M19 10a7 7 0 0 1-14 0"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
        </svg>
      }
      steps={[
        'Go to elevenlabs.io → Conversational AI → Settings → Post-Call Webhook',
        'Create Webhook → paste URL above → Save',
        'Copy signing secret → paste below → Save Secret',
      ]}
      extra={
        <div style={{ marginTop: 16 }}>
          {/* Configured badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: configured ? '#00D082' : '#F0B429',
              boxShadow: configured ? '0 0 6px rgba(0,208,130,0.7)' : '0 0 6px rgba(240,180,41,0.6)',
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: configured ? '#00D082' : '#F0B429', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {configured ? 'Configured' : 'Not configured'}
            </span>
            {secretMasked && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>— current: {secretMasked}</span>
            )}
          </div>

          {/* Signing secret input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type={showSec ? 'text' : 'password'}
                value={secret} onChange={(e) => setSecret(e.target.value)}
                placeholder={secretMasked ? 'Enter new secret to replace…' : 'Paste signing secret from ElevenLabs…'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 9, padding: '9px 36px 9px 12px',
                  fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <button onClick={() => setShowSec((v) => !v)} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0,
              }}>
                {showSec
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
            <button
              onClick={handleSaveSecret} disabled={saving || !secret.trim()}
              style={{
                padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                cursor: secret.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                background: saved ? 'rgba(0,208,130,0.15)' : 'rgba(0,194,184,0.14)',
                border: `1px solid ${saved ? 'rgba(0,208,130,0.40)' : 'rgba(0,194,184,0.30)'}`,
                color: saved ? '#00D082' : '#00C2B8', opacity: !secret.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
              }}
            >
              {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Secret'}
            </button>
          </div>
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'rgba(0,194,184,0.06)', borderRadius: 8, border: '1px solid rgba(0,194,184,0.14)',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00C2B8" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontSize: 11, color: '#00C2B8', lineHeight: 1.5 }}>
              Without webhook: transcripts use a background retry (delay = call duration). With webhook: transcripts appear within ~20s.
            </span>
          </div>
        </div>
      }
    />
  );
}

// ─── Credentials tab ──────────────────────────────────────────────────────────
function CredentialsTab() {
  const [creds, setCreds] = useState<CredentialsData | null>(null);
  useEffect(() => { settingsApi.getCredentials().then(setCreds).catch(() => {}); }, []);

  async function saveEL(vals: Record<string, string>) {
    if (vals.api_key !== undefined) {
      await settingsApi.saveCredentials({ elevenlabs_api_key: vals.api_key || null });
      setCreds(await settingsApi.getCredentials());
    }
  }
  async function saveTwilio(vals: Record<string, string>) {
    const body: Record<string, string | null> = {};
    if (vals.account_sid !== undefined) body.twilio_account_sid = vals.account_sid || null;
    if (vals.auth_token !== undefined) body.twilio_auth_token = vals.auth_token || null;
    await settingsApi.saveCredentials(body);
    setCreds(await settingsApi.getCredentials());
  }
  async function saveLLM(vals: Record<string, string>) {
    const body: Record<string, string | null> = {};
    if (vals.openai !== undefined) body.openai_api_key = vals.openai || null;
    if (vals.google !== undefined) body.google_api_key = vals.google || null;
    if (vals.anthropic !== undefined) body.anthropic_api_key = vals.anthropic || null;
    await settingsApi.saveCredentials(body);
    setCreds(await settingsApi.getCredentials());
  }

  const llmConnected = Boolean(
    creds?.openai_api_key_masked || creds?.google_api_key_masked || creds?.anthropic_api_key_masked
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <CredCard title="ElevenLabs" accent="#00D082" connected={Boolean(creds?.elevenlabs_connected)}
          initValues={{ api_key: creds?.elevenlabs_api_key_masked ?? '' }} delay={0}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00D082" strokeWidth="2" strokeLinecap="round"><path d="M12 2a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0V4a2 2 0 0 1 2-2z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>}
          fields={[{ key: 'api_key', label: 'API Key', secret: true, placeholder: 'sk_...' }]}
          onSave={saveEL}
        />
        <CredCard title="Twilio" accent="#38BDF8" connected={Boolean(creds?.twilio_connected)}
          initValues={{ account_sid: creds?.twilio_account_sid ?? '', auth_token: creds?.twilio_auth_token_masked ?? '' }} delay={60}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>}
          fields={[
            { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxx' },
            { key: 'auth_token', label: 'Auth Token', secret: true, placeholder: '••••••••••••' },
          ]}
          onSave={saveTwilio}
        />
        <CredCard title="AI / LLM" accent="#8B5CF6" connected={llmConnected}
          initValues={{ openai: creds?.openai_api_key_masked ?? '', google: creds?.google_api_key_masked ?? '', anthropic: creds?.anthropic_api_key_masked ?? '' }} delay={120}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>}
          fields={[
            { key: 'openai', label: 'OpenAI Key', secret: true, placeholder: 'sk-...' },
            { key: 'google', label: 'Google Gemini Key', secret: true, placeholder: 'AIza...' },
            { key: 'anthropic', label: 'Anthropic Key', secret: true, placeholder: 'sk-ant-...' },
          ]}
          onSave={saveLLM}
        />
      </div>

      {creds && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WebhookSection webhookBaseUrl={creds.webhook_base_url} />
          <ElevenLabsWebhookSection
            webhookBaseUrl={creds.webhook_base_url}
            secretMasked={creds.elevenlabs_webhook_secret_masked}
            configured={creds.elevenlabs_webhook_configured}
          />
        </div>
      )}
    </div>
  );
}

// ─── Cost monitoring tab ─────────────────────────────────────────────────────
function CostMonitoringTab() {
  const [cost, setCost] = useState<ElevenLabsCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setCost(await settingsApi.getElevenLabsCost());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ElevenLabs usage');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const level = cost?.warning_level ?? 'ok';
  const accent =
    level === 'error' || level === 'critical' ? '#FF4D6D'
      : level === 'warning' ? '#F0B429'
      : '#00D082';
  const usage = Math.min(Math.max(cost?.character_usage_percent ?? 0, 0), 100);
  const remaining = cost?.character_remaining ?? 0;
  const limit = cost?.character_limit ?? 0;
  const used = cost?.character_count ?? 0;
  const resetDate = cost?.next_character_count_reset_unix
    ? new Date(cost.next_character_count_reset_unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not provided';

  function money(cents?: number | null, currency?: string | null) {
    if (cents == null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format(cents / 100);
  }

  function period(value?: string | null) {
    return value ? value.replaceAll('_', ' ') : '—';
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, padding: 24, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, background: 'rgba(9,20,38,0.60)', color: 'var(--text-muted)' }}>
        Loading ElevenLabs cost and quota data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 900, padding: 24, border: '1px solid rgba(255,77,109,0.22)', borderRadius: 16, background: 'rgba(255,77,109,0.05)', color: '#FFB4C2' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, animation: 'fade-in 0.4s both' }}>
      <div style={{
        background: 'rgba(9,20,38,0.66)',
        border: `1px solid ${accent}30`,
        borderRadius: 16,
        padding: '22px 24px',
        marginBottom: 16,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 0 24px ${accent}10`,
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}00, ${accent}88, ${accent}00)` }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11,
            background: `${accent}14`, border: `1px solid ${accent}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round">
              <path d="M3 3v18h18"/><path d="M7 14l3-3 3 2 5-7"/><path d="M18 6h-4"/><path d="M18 6v4"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-syne)' }}>
                ElevenLabs Cost Monitoring
              </h3>
              <button
                onClick={refresh}
                style={{
                  padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700,
                }}
              >
                Refresh
              </button>
            </div>
            <p style={{ margin: 0, color: accent, fontSize: 12.5, lineHeight: 1.6 }}>
              {cost?.warning_message || 'ElevenLabs usage is within the normal range.'}
            </p>
            {cost?.cached && (
              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-muted)' }}>
                Showing cached data, refreshed every 5 minutes.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{
          background: 'rgba(9,20,38,0.60)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '22px 24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
                Character Quota
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {remaining.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                remaining of {limit.toLocaleString()} characters
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: accent, fontFamily: 'var(--font-mono)' }}>{usage.toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>used</div>
            </div>
          </div>

          <div style={{ height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: `${usage}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${accent}AA)`, borderRadius: 999, transition: 'width 0.3s' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 18 }}>
            {[
              ['Used', used.toLocaleString()],
              ['Remaining', remaining.toLocaleString()],
              ['Reset', resetDate],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(9,20,38,0.60)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '22px 24px',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
            Subscription
          </div>
          {[
            ['Plan', cost?.tier ?? 'unknown'],
            ['Status', cost?.status ?? 'unknown'],
            ['Billing period', period(cost?.billing_period)],
            ['Refresh period', period(cost?.character_refresh_period)],
            ['Overage allowed', cost?.can_extend_character_limit && cost?.allowed_to_extend_character_limit ? 'Yes' : 'No'],
            ['Max extension', cost?.max_character_limit_extension != null ? cost.max_character_limit_extension.toLocaleString() : '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: label === 'Status' || label === 'Plan' ? 'capitalize' : 'none', textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{
          background: 'rgba(9,20,38,0.60)', border: `1px solid ${cost?.has_open_invoices ? 'rgba(240,180,41,0.24)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 16, padding: '20px 22px',
        }}>
          <div style={{ fontSize: 10, color: '#F0B429', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
            Billing Signals
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Open invoices</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: cost?.has_open_invoices ? '#F0B429' : '#00D082' }}>
              {cost?.has_open_invoices ? `${cost.open_invoices.length || 1} open` : 'None'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Next invoice</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
              {money(cost?.next_invoice?.amount_due_cents, cost?.currency)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Payment status</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
              {cost?.next_invoice?.payment_intent_status ?? '—'}
            </span>
          </div>
        </div>

        <div style={{
          background: 'rgba(9,20,38,0.60)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '20px 22px',
        }}>
          <div style={{ fontSize: 10, color: '#38BDF8', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Why This Matters
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            ElevenLabs may reject or terminate conversations when quota is exhausted, billing is inactive, or invoices require attention. This panel gives an early warning before test calls or campaigns start dropping without an obvious frontend error.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────
function AccountTab() {
  const { user, logout } = useAuth();
  const { data: usage } = useUsage();
  const [loggingOut, setLoggingOut] = useState(false);
  const tier = user?.subscription_tier
    ? user.subscription_tier.charAt(0).toUpperCase() + user.subscription_tier.slice(1)
    : 'Free';

  const sections = [
    { label: 'Workspace', accent: '#00D082', rows: [
      ['Name', user?.full_name ?? '—'],
      ['Email', user?.email ?? '—'],
      ['Company', user?.company_name ?? '—'],
    ]},
    { label: 'Voice Infrastructure', accent: '#38BDF8', rows: [
      ['AI Voice Engine', 'ElevenLabs · Turbo v2.5'],
      ['Telephony', 'Twilio'],
      ['Transcription', 'Voxara Native'],
    ]},
    { label: 'Billing & Usage', accent: '#F0B429', rows: [
      ['Plan', `${tier} plan`],
      ['Total calls', (usage?.total_calls ?? 0).toLocaleString()],
      ['Total minutes', `${usage?.total_minutes ?? 0} min`],
    ]},
  ];

  return (
    <div style={{ maxWidth: 700, animation: 'fade-in 0.4s both' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        {sections.map(({ label, accent, rows }) => (
          <div key={label} style={{
            background: 'rgba(9,20,38,0.60)', backdropFilter: 'blur(20px)',
            border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 16, overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: `linear-gradient(90deg, ${accent}00, ${accent}70, ${accent}00)`,
            }} />
            <div style={{ padding: '16px 18px 12px' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent, marginBottom: 12 }}>
                {label}
              </div>
              {rows.map(([k, v]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', maxWidth: '55%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sign out */}
      <div style={{
        padding: '18px 20px',
        background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.12)',
        borderRadius: 14,
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#FF4D6D', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Session
        </div>
        <button
          onClick={async () => { setLoggingOut(true); await logout(); }}
          disabled={loggingOut}
          style={{
            padding: '8px 20px', background: 'rgba(255,77,109,0.08)',
            border: '1px solid rgba(255,77,109,0.22)', borderRadius: 9,
            color: '#FF4D6D', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            opacity: loggingOut ? 0.6 : 1, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,109,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,77,109,0.08)'; }}
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Settings View ───────────────────────────────────────────────────────
type Tab = 'credentials' | 'cost' | 'account';

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('credentials');

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', animation: 'fade-in 0.4s both' }}>
      <style>{`
        @keyframes orb-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.85)} }
        @keyframes spin-cw   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6,
        }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Manage API credentials, cost monitoring, webhooks, and account details.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'inline-flex', gap: 2, marginBottom: 24,
        padding: 3, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11,
      }}>
        {(['credentials', 'cost', 'account'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 22px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, transition: 'all 0.18s',
              background: tab === t
                ? 'linear-gradient(135deg, rgba(0,208,130,0.14) 0%, rgba(0,194,184,0.08) 100%)'
                : 'transparent',
              color: tab === t ? '#00D082' : 'var(--text-muted)',
              outline: 'none',
              borderWidth: 1, borderStyle: 'solid',
              borderColor: tab === t ? 'rgba(0,208,130,0.25)' : 'transparent',
              boxShadow: tab === t ? '0 0 12px rgba(0,208,130,0.10)' : 'none',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'credentials' && <CredentialsTab />}
      {tab === 'cost' && <CostMonitoringTab />}
      {tab === 'account' && <AccountTab />}
    </div>
  );
}
