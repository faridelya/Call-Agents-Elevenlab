'use client';

import { useState, useEffect } from 'react';
import type { Agent } from '@/lib/api';

// ─── Keyframes injected once ──────────────────────────────────────────────────
const STYLES = `
@keyframes drawer-slide {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes scan-line {
  0%   { top: 0;    opacity: 0.7; }
  90%  { top: 100%; opacity: 0.7; }
  100% { top: 100%; opacity: 0; }
}
@keyframes section-rise {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ring-draw {
  from { stroke-dashoffset: var(--full); }
  to   { stroke-dashoffset: var(--offset); }
}
@keyframes badge-pop {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes glow-breathe {
  0%,100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  agent: Agent;
  onClose: () => void;
  onEdit?: () => void;
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function fmt(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDur(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim();
}

// ─── Circular Gauge ────────────────────────────────────────────────────────────
function Ring({ value, label, color, size = 64 }: {
  value: number; label: string; color: string; size?: number;
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 300); return () => clearTimeout(t); }, []);
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const offset = circ - (animated ? value : 0) * circ;
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="#E2E8F0" strokeWidth={5} />
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth={5}
            strokeDasharray={`${circ}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)',
              filter: `drop-shadow(0 0 5px ${color}99)`,
            }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size < 64 ? 11 : 13, fontWeight: 800,
          color, fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '-0.02em',
        }}>
          {pct}
        </div>
      </div>
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: '#64748B',
        textAlign: 'center', lineHeight: 1.3, maxWidth: size,
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, accent = '#10B981', delay = 0, children }: {
  title: string; icon: React.ReactNode;
  accent?: string; delay?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      marginBottom: 28,
      animation: `section-rise 0.5s ${delay}ms both`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: `${accent}12`, border: `1px solid ${accent}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: accent,
        }}>
          {title}
        </span>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}30, transparent)` }} />
      </div>
      {children}
    </div>
  );
}

// ─── KV row ───────────────────────────────────────────────────────────────────
function KV({ k, v, mono = false, accent }: {
  k: string; v: React.ReactNode; mono?: boolean; accent?: string;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '8px 0', borderBottom: '1px solid #F1F5F9',
    }}>
      <span style={{ fontSize: 11, color: '#64748B', flex: '0 0 auto', marginRight: 16 }}>{k}</span>
      <span style={{
        fontSize: 12, fontWeight: 600, textAlign: 'right', lineHeight: 1.4,
        color: accent ?? '#0F172A',
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
        letterSpacing: mono ? '0.03em' : 0,
        wordBreak: 'break-all',
      }}>
        {v || <span style={{ color: '#94A3B8', fontWeight: 400 }}>—</span>}
      </span>
    </div>
  );
}

// ─── Script card ──────────────────────────────────────────────────────────────
function ScriptCard({ label, text, color, delay }: {
  label: string; text?: string; color: string; delay: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const preview = text.length > 160 && !expanded ? text.slice(0, 160) + '…' : text;
  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      border: '1px solid #E2E8F0',
      background: '#F8FAFC',
      marginBottom: 10,
      animation: `section-rise 0.4s ${delay}ms both`,
    }}>
      <div style={{
        height: 2,
        background: `linear-gradient(90deg, ${color}, ${color}55, transparent)`,
      }} />
      <div style={{ padding: '10px 14px' }}>
        <div style={{
          fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.1em', color, marginBottom: 7,
        }}>
          {label}
        </div>
        <p style={{
          fontSize: 12, color: '#4B5563', lineHeight: 1.65,
          margin: 0, whiteSpace: 'pre-wrap',
        }}>
          {preview}
        </p>
        {text.length > 160 && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: 6, background: 'none', border: 'none', padding: 0,
              fontSize: 10.5, color, cursor: 'pointer', fontWeight: 600,
            }}
          >
            {expanded ? '↑ Show less' : '↓ Show more'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tool pill ────────────────────────────────────────────────────────────────
function ToolPill({ name, idx }: { name: string; idx: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 20,
      background: 'rgba(0,194,184,0.07)',
      border: '1px solid rgba(0,194,184,0.22)',
      fontSize: 10.5, fontWeight: 600, color: '#06B6D4',
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: '0.02em',
      animation: `badge-pop 0.3s ${idx * 50}ms both`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: '#06B6D4',
        boxShadow: '0 0 6px rgba(0,194,184,0.8)',
        animation: 'glow-breathe 2s infinite',
      }} />
      {name}
    </span>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20,
      background: `${color}12`, border: `1px solid ${color}30`,
      fontSize: 10.5, fontWeight: 700, color,
      textTransform: 'capitalize', letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  );
}

// ─── AgentPreviewDrawer ───────────────────────────────────────────────────────
export function AgentPreviewDrawer({ agent, onClose, onEdit }: Props) {
  const isActive = agent.is_active;
  const isSynced = Boolean(agent.elevenlabs_agent_id);
  const accentPrimary = isActive ? '#10B981' : '#F0B429';

  const callTypeColor =
    agent.call_type === 'outbound' ? '#38BDF8'
    : agent.call_type === 'inbound' ? '#10B981'
    : '#A89AF9';

  const hasScript = Object.values(agent.call_script ?? {}).some(Boolean);
  const hasTools  = (agent.enabled_tools ?? []).length > 0;
  const hasCriteria = Object.keys(agent.qualification_criteria ?? {}).length > 0;
  const hasCatalog  = (agent.product_catalog ?? []).length > 0;

  return (
    <>
      <style>{STYLES}</style>

      {/* Backdrop — transparent click-away target only */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'transparent',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(760px, 78vw)',
        zIndex: 1001,
        background: '#FFFFFF',
        backdropFilter: 'none',
        borderLeft: 'none',
        boxShadow: '-8px 0 40px rgba(15,23,42,0.10)',
        display: 'flex', flexDirection: 'column',
        animation: 'drawer-slide 0.38s cubic-bezier(0.16,1,0.3,1) both',
        overflow: 'hidden',
      }}>

        {/* Left accent spine */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: `linear-gradient(180deg, ${accentPrimary}, #00C2B8 50%, transparent)`,
          zIndex: 2,
        }} />

        {/* Scan-line effect on open */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${accentPrimary}60, transparent)`,
          zIndex: 3, pointerEvents: 'none',
          animation: 'scan-line 1.4s ease-out 0.2s both',
        }} />

        {/* Subtle dot grid background */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `radial-gradient(circle, rgba(15,23,42,0.04) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
          opacity: 0.6,
        }} />

        {/* ── STICKY HEADER ── */}
        <div style={{
          flexShrink: 0, padding: '22px 28px 18px 28px',
          borderBottom: '1px solid #F1F5F9',
          background: '#FFFFFF',
          backdropFilter: 'none',
          position: 'relative', zIndex: 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

            {/* Left: identity */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Status + type badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  background: `${accentPrimary}10`,
                  border: `1px solid ${accentPrimary}28`,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: accentPrimary,
                    boxShadow: `0 0 8px ${accentPrimary}99`,
                    animation: isActive ? 'glow-breathe 2s infinite' : 'none',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: accentPrimary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
                <Badge label={agent.call_type} color={callTypeColor} />
                {isSynced
                  ? <Badge label="EL Synced" color="#00D082" />
                  : <Badge label="Not Synced" color="#F0B429" />}
              </div>

              {/* Name */}
              <h2 style={{
                fontFamily: 'var(--font-display), sans-serif',
                fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em',
                color: '#0F172A', margin: 0, marginBottom: 5,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {agent.name}
              </h2>

              {/* Meta line */}
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#64748B' }}>
                {agent.company_name && <span>{agent.company_name}</span>}
                {agent.agent_role   && <span>· {agent.agent_role}</span>}
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
                  {agent.language.toUpperCase()}
                </span>
                <span>· Created {fmt(agent.created_at)}</span>
              </div>
            </div>

            {/* Right: actions */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 18 }}>
              {onEdit && (
                <button
                  onClick={onEdit}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 9,
                    background: 'rgba(0,208,130,0.1)',
                    border: '1px solid rgba(0,208,130,0.3)',
                    color: '#10B981', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,208,130,0.18)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,208,130,0.1)'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#64748B',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,109,0.15)'; e.currentTarget.style.color = '#FF4D6D'; e.currentTarget.style.borderColor = 'rgba(255,77,109,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#64748B'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '28px 28px 40px',
          position: 'relative', zIndex: 1,
        }}>

          {/* ── 1. IDENTITY ── */}
          {(agent.description || agent.product_name || agent.company_name || agent.agent_role) && (
            <Section title="Identity" accent="#38BDF8" delay={0} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            }>
              {agent.description && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'rgba(59,130,246,0.04)',
                  border: '1px solid rgba(59,130,246,0.12)',
                  fontSize: 12.5, color: '#374151',
                  lineHeight: 1.7, marginBottom: 12,
                }}>
                  {agent.description}
                </div>
              )}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #F1F5F9',
                borderRadius: 10, padding: '4px 14px',
              }}>
                {agent.agent_role   && <KV k="Role"     v={agent.agent_role} />}
                {agent.company_name && <KV k="Company"  v={agent.company_name} />}
                {agent.product_name && <KV k="Product"  v={agent.product_name} accent="#38BDF8" />}
                <KV k="Language" v={agent.language} mono />
              </div>
            </Section>
          )}

          {/* ── 2. CONNECTIVITY ── */}
          <Section title="Connectivity" accent="#00D082" delay={60} icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00D082" strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          }>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Outbound Number', value: agent.twilio_phone_number, color: '#38BDF8', icon: '↗' },
                { label: 'Inbound Number',  value: agent.inbound_phone_number, color: '#10B981', icon: '↙' },
              ].map(({ label, value, color, icon }) => (
                <div key={label} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: value ? `${color}07` : '#F8FAFC',
                  border: `1px solid ${value ? color + '20' : '#F1F5F9'}`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: value ? color : '#94A3B8', marginBottom: 6 }}>
                    {icon} {label}
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, color: value ? color : '#CBD5E1' }}>
                    {value || 'Not configured'}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
              <KV k="ElevenLabs ID" v={agent.elevenlabs_agent_id} mono accent={isSynced ? '#10B981' : undefined} />
              {agent.el_last_synced_at && <KV k="Last Synced" v={fmt(agent.el_last_synced_at)} />}
            </div>
          </Section>

          {/* ── 3. VOICE & AI METRICS ── */}
          <Section title="Voice & AI Configuration" accent="#A89AF9" delay={120} icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A89AF9" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          }>
            {/* LLM Temperature gauge */}
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              padding: '16px',
              background: 'rgba(139,92,246,0.04)', borderRadius: 12,
              border: '1px solid rgba(168,154,249,0.12)', marginBottom: 12,
            }}>
              <Ring value={agent.llm_temperature} label="LLM Temperature" color="#F0B429" />
            </div>

            {/* Config table */}
            <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 10, padding: '4px 14px' }}>
              <KV k="LLM Model"       v={agent.llm_model}                    mono accent="#A89AF9" />
              <KV k="Voice ID"        v={agent.voice_id}                     mono />
              <KV k="Max Duration"    v={fmtDur(agent.max_call_duration_seconds)} />
              <KV k="Silence Timeout" v={fmtDur(agent.silence_timeout_seconds)}  />
            </div>
          </Section>

          {/* ── 4. SYSTEM PROMPT ── */}
          {agent.system_prompt && (
            <Section title="System Prompt" accent="#F0B429" delay={180} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F0B429" strokeWidth="2.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            }>
              <ExpandableText text={agent.system_prompt} accent="#F0B429" />
            </Section>
          )}

          {/* ── 5. FIRST MESSAGE ── */}
          {agent.first_message && (
            <Section title="First Message (Greeting)" accent="#00C2B8" delay={220} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00C2B8" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            }>
              <div style={{
                padding: '12px 16px', borderRadius: 10,
                background: 'rgba(0,194,184,0.06)', border: '1px solid rgba(0,194,184,0.18)',
                fontSize: 13, color: '#374151',
                lineHeight: 1.7, fontStyle: 'italic',
              }}>
                &ldquo;{agent.first_message}&rdquo;
              </div>
            </Section>
          )}

          {/* ── 6. CALL SCRIPT ── */}
          {hasScript && (
            <Section title="Call Script" accent="#38BDF8" delay={260} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            }>
              {[
                { key: 'opener',            label: 'Opener',             color: '#38BDF8', d: 0   },
                { key: 'discovery',         label: 'Discovery',          color: '#A89AF9', d: 50  },
                { key: 'pitch',             label: 'Pitch',              color: '#10B981', d: 100 },
                { key: 'objection_handling',label: 'Objection Handling', color: '#F0B429', d: 150 },
                { key: 'closing',           label: 'Closing',            color: '#06B6D4', d: 200 },
                { key: 'faq',               label: 'FAQ',                color: '#FF4D6D', d: 250 },
              ].map(({ key, label, color, d }) => {
                const text = agent.call_script?.[key as keyof typeof agent.call_script];
                return text ? (
                  <ScriptCard key={key} label={label} text={text} color={color} delay={d} />
                ) : null;
              })}
            </Section>
          )}

          {/* ── 7. TOOLS ── */}
          {hasTools && (
            <Section title="Enabled Tools" accent="#00C2B8" delay={300} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00C2B8" strokeWidth="2.5" strokeLinecap="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            }>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {agent.enabled_tools.map((t, i) => <ToolPill key={t} name={t} idx={i} />)}
              </div>
            </Section>
          )}

          {/* ── 8. QUALIFICATION CRITERIA ── */}
          {hasCriteria && (
            <Section title="Qualification Criteria" accent="#FF4D6D" delay={340} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6D" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            }>
              <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 10, padding: '4px 14px' }}>
                {Object.entries(agent.qualification_criteria).map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              </div>
            </Section>
          )}

          {/* ── 9. PRODUCT CATALOG ── */}
          {hasCatalog && (
            <Section title={`Product Catalog (${agent.product_catalog.length} items)`} accent="#A89AF9" delay={380} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A89AF9" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            }>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(agent.product_catalog as Record<string, unknown>[]).slice(0, 6).map((item, i) => (
                  <div key={i} style={{
                    padding: '9px 12px', borderRadius: 9,
                    background: 'rgba(139,92,246,0.04)',
                    border: '1px solid rgba(168,154,249,0.14)',
                    fontSize: 11.5, color: '#4B5563',
                    animation: `section-rise 0.35s ${i * 60}ms both`,
                  }}>
                    {typeof item === 'object' && item !== null
                      ? Object.entries(item).map(([k, v]) => (
                        <span key={k} style={{ marginRight: 12 }}>
                          <span style={{ color: 'rgba(139,92,246,0.8)', fontSize: 10 }}>{k}: </span>
                          {String(v)}
                        </span>
                      ))
                      : String(item)}
                  </div>
                ))}
                {agent.product_catalog.length > 6 && (
                  <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: '4px 0' }}>
                    +{agent.product_catalog.length - 6} more items
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ── FOOTER ── */}
          <div style={{
            marginTop: 8, paddingTop: 20,
            borderTop: '1px solid #F1F5F9',
            display: 'flex', gap: 16, fontSize: 10.5,
            color: '#94A3B8', fontFamily: 'JetBrains Mono, monospace',
          }}>
            <span>ID: {agent.id}</span>
            <span>·</span>
            <span>Updated {fmt(agent.updated_at)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Expandable text block ────────────────────────────────────────────────────
function ExpandableText({ text, accent }: { text: string; accent: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 320;
  const long = text.length > LIMIT;
  const shown = long && !expanded ? text.slice(0, LIMIT) + '…' : text;
  return (
    <div style={{
      background: `${accent}07`, border: `1px solid ${accent}18`,
      borderRadius: 10, padding: '12px 16px',
    }}>
      <pre style={{
        margin: 0, fontFamily: 'inherit',
        fontSize: 12, color: '#374151',
        lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {shown}
      </pre>
      {long && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 8, background: 'none', border: 'none', padding: 0,
            fontSize: 11, color: accent, cursor: 'pointer', fontWeight: 700,
          }}
        >
          {expanded ? '↑ Collapse' : '↓ Show full prompt'}
        </button>
      )}
    </div>
  );
}
