'use client';

import { useState, useEffect } from 'react';
import type { Agent } from '@/lib/api';

const STYLES = `
@keyframes drawer-slide {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes section-rise {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes badge-pop {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes glow-breathe {
  0%,100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
`;

// ─── Tool metadata map ────────────────────────────────────────────────────────
const TOOL_META: Record<string, { label: string; desc: string; type: string }> = {
  save_lead:            { label: 'Save Lead',            desc: 'Capture and upsert contact info from the conversation', type: 'Built-in' },
  get_contact_info:     { label: 'Get Contact Info',     desc: 'Pull CRM contact data into agent context before responding', type: 'Built-in' },
  end_call:             { label: 'End Call',             desc: 'Hang up the call programmatically after a proper close', type: 'Built-in' },
  log_call_outcome:     { label: 'Log Outcome',          desc: 'Record the call disposition and outcome mid-call', type: 'Built-in' },
  get_call_script:      { label: 'Get Call Script',      desc: 'Fetch the active call script for this agent', type: 'Built-in' },
  update_call_stage:    { label: 'Update Call Stage',    desc: 'Advance the call through pipeline stages in real time', type: 'Built-in' },
  transfer_to_human:    { label: 'Transfer to Human',    desc: 'Warm transfer via Twilio REST — records the human-agent leg', type: 'Server webhook' },
  leave_voicemail:      { label: 'Leave Voicemail',      desc: 'Drop a TTS voicemail when the contact does not answer', type: 'Server webhook' },
  qualify_lead:         { label: 'Qualify Lead',         desc: 'Score the lead against your configured qualification criteria', type: 'Server webhook' },
  el_transfer_to_number:{ label: 'EL Transfer to Number',desc: 'ElevenLabs native call transfer — handles routing natively without backend callback', type: 'EL Native' },
  el_end_conversation:  { label: 'EL End Conversation',  desc: 'ElevenLabs native clean hang-up', type: 'EL Native' },
  el_language_detection:{ label: 'EL Language Detection',desc: 'Auto-detect caller language and switch response language', type: 'EL Native' },
};

const TYPE_COLOR: Record<string, string> = {
  'Built-in':      '#64748B',
  'Server webhook':'#7C6EFA',
  'EL Native':     '#10B981',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  agent: Agent;
  onClose: () => void;
  onEdit?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDur(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60 > 0 ? ` ${s % 60}s` : ''}`;
}

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ title, icon, delay = 0, children }: {
  title: string; icon: React.ReactNode; delay?: number; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24, animation: `section-rise 0.4s ${delay}ms both` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: '#F1F5F9', border: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#0F172A' }}>
          {title}
        </span>
        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      </div>
      {children}
    </div>
  );
}

// ─── KV row ──────────────────────────────────────────────────────────────────
function KV({ k, v, mono = false }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '7px 0', borderBottom: '1px solid #F1F5F9',
    }}>
      <span style={{ fontSize: 11, color: '#64748B', flex: '0 0 auto', marginRight: 16 }}>{k}</span>
      <span style={{
        fontSize: 12, fontWeight: 600, textAlign: 'right', lineHeight: 1.4,
        color: '#0F172A',
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
        letterSpacing: mono ? '0.03em' : 0,
        wordBreak: 'break-all',
      }}>
        {v || <span style={{ color: '#94A3B8', fontWeight: 400 }}>—</span>}
      </span>
    </div>
  );
}

// ─── Expandable text ─────────────────────────────────────────────────────────
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 320;
  const long = text.length > LIMIT;
  const shown = long && !expanded ? text.slice(0, LIMIT) + '…' : text;
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px' }}>
      <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 12, color: '#374151', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {shown}
      </pre>
      {long && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 11, color: '#7C6EFA', cursor: 'pointer', fontWeight: 700 }}
        >
          {expanded ? '↑ Collapse' : '↓ Show full prompt'}
        </button>
      )}
    </div>
  );
}

// ─── Script card ─────────────────────────────────────────────────────────────
function ScriptCard({ label, text, delay }: { label: string; text?: string; delay: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const preview = text.length > 160 && !expanded ? text.slice(0, 160) + '…' : text;
  return (
    <div style={{
      borderRadius: 9, border: '1px solid #E2E8F0', background: '#F8FAFC',
      marginBottom: 8, animation: `section-rise 0.35s ${delay}ms both`,
      overflow: 'hidden',
    }}>
      <div style={{ height: 2, background: '#7C6EFA33' }} />
      <div style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748B', marginBottom: 6 }}>
          {label}
        </div>
        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{preview}</p>
        {text.length > 160 && (
          <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, fontSize: 10.5, color: '#7C6EFA', cursor: 'pointer', fontWeight: 600 }}>
            {expanded ? '↑ Show less' : '↓ Show more'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tool row ────────────────────────────────────────────────────────────────
function ToolRow({ toolId, idx }: { toolId: string; idx: number }) {
  const meta = TOOL_META[toolId];
  const label = meta?.label ?? toolId;
  const desc  = meta?.desc  ?? 'Custom or third-party tool';
  const type  = meta?.type  ?? 'Custom';
  const typeColor = TYPE_COLOR[type] ?? '#94A3B8';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 12px', borderRadius: 9,
      background: '#F8FAFC', border: '1px solid #E2E8F0',
      animation: `badge-pop 0.3s ${idx * 50}ms both`,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: typeColor, flexShrink: 0, marginTop: 5,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{label}</span>
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: typeColor,
            background: typeColor + '12', border: `1px solid ${typeColor}25`,
            padding: '1px 7px', borderRadius: 12, letterSpacing: '0.04em',
          }}>{type}</span>
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: '#64748B', lineHeight: 1.5 }}>{desc}</p>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#94A3B8', marginTop: 2, display: 'block' }}>{toolId}</span>
      </div>
    </div>
  );
}

// ─── AgentPreviewDrawer ───────────────────────────────────────────────────────
export function AgentPreviewDrawer({ agent, onClose, onEdit }: Props) {
  const isActive = agent.is_active;
  const isSynced = Boolean(agent.elevenlabs_agent_id);

  const hasScript    = Object.values(agent.call_script ?? {}).some(Boolean);
  const hasTools     = (agent.enabled_tools ?? []).length > 0;
  const hasCriteria  = Object.keys(agent.qualification_criteria ?? {}).length > 0;
  const hasCatalog   = (agent.product_catalog ?? []).length > 0;
  const hasAnalysis  = (agent.evaluation_criteria ?? []).length > 0;

  const statusColor = isActive ? '#10B981' : '#F59E0B';

  return (
    <>
      <style>{STYLES}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(2px)' }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(720px, 78vw)', zIndex: 1001,
        background: '#FFFFFF',
        boxShadow: '-6px 0 32px rgba(15,23,42,0.12)',
        display: 'flex', flexDirection: 'column',
        animation: 'drawer-slide 0.35s cubic-bezier(0.16,1,0.3,1) both',
        overflow: 'hidden',
      }}>

        {/* Left accent spine */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#7C6EFA', zIndex: 2 }} />

        {/* ── HEADER ── */}
        <div style={{
          flexShrink: 0, padding: '20px 24px 16px 28px',
          borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', position: 'relative', zIndex: 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Status badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  background: statusColor + '10', border: `1px solid ${statusColor}28`,
                  fontSize: 10, fontWeight: 700, color: statusColor, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, animation: isActive ? 'glow-breathe 2s infinite' : 'none' }} />
                  {isActive ? 'Active' : 'Paused'}
                </span>
                <span style={{
                  padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                  background: '#F1F5F9', color: '#475569', textTransform: 'capitalize',
                }}>
                  {agent.call_type}
                </span>
                {isSynced
                  ? <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: '#ECFDF5', color: '#10B981', border: '1px solid #A7F3D0' }}>EL Synced</span>
                  : <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>Not Synced</span>}
              </div>

              {/* Name */}
              <h2 style={{
                fontFamily: 'var(--font-display), sans-serif',
                fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em',
                color: '#0F172A', margin: 0, marginBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {agent.name}
              </h2>

              <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: '#64748B', flexWrap: 'wrap' }}>
                {agent.company_name && <span>{agent.company_name}</span>}
                {agent.agent_role && <span>· {agent.agent_role}</span>}
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{agent.language.toUpperCase()}</span>
                <span>· Created {fmt(agent.created_at)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
              {onEdit && (
                <button
                  onClick={onEdit}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                    color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
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
                  background: '#F1F5F9', border: '1px solid #E2E8F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#64748B', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#FECACA'; }}
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 40px 28px', position: 'relative', zIndex: 1 }}>

          {/* ── 1. IDENTITY ── */}
          {(agent.description || agent.product_name || agent.company_name || agent.agent_role) && (
            <Section title="Identity" delay={0} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            }>
              {agent.description && (
                <div style={{ padding: '10px 14px', borderRadius: 9, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#374151', lineHeight: 1.7, marginBottom: 10 }}>
                  {agent.description}
                </div>
              )}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 9, padding: '4px 14px' }}>
                {agent.agent_role   && <KV k="Role"     v={agent.agent_role} />}
                {agent.company_name && <KV k="Company"  v={agent.company_name} />}
                {agent.product_name && <KV k="Product"  v={agent.product_name} />}
                <KV k="Language" v={agent.language} mono />
              </div>
            </Section>
          )}

          {/* ── 2. CONNECTIVITY ── */}
          <Section title="Connectivity" delay={50} icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          }>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              {[
                { label: 'Outbound Number', value: agent.twilio_phone_number },
                { label: 'Inbound Number',  value: agent.inbound_phone_number },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 14px', borderRadius: 9, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', marginBottom: 5 }}>{label}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, color: value ? '#0F172A' : '#CBD5E1' }}>
                    {value || 'Not configured'}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 9, padding: '4px 14px' }}>
              <KV k="ElevenLabs ID" v={agent.elevenlabs_agent_id} mono />
              {agent.el_last_synced_at && <KV k="Last Synced" v={fmt(agent.el_last_synced_at)} />}
            </div>
          </Section>

          {/* ── 3. VOICE & AI CONFIG ── */}
          <Section title="Voice & AI Configuration" delay={100} icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          }>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 9, padding: '4px 14px' }}>
              <KV k="LLM Model"       v={agent.llm_model} mono />
              <KV k="Temperature"     v={agent.llm_temperature.toFixed(1)} mono />
              <KV k="Voice ID"        v={agent.voice_id} mono />
              <KV k="Max Duration"    v={fmtDur(agent.max_call_duration_seconds)} />
              <KV k="Silence Timeout" v={fmtDur(agent.silence_timeout_seconds)} />
            </div>
          </Section>

          {/* ── 4. SYSTEM PROMPT ── */}
          {agent.system_prompt && (
            <Section title="System Prompt" delay={150} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            }>
              <ExpandableText text={agent.system_prompt} />
            </Section>
          )}

          {/* ── 5. FIRST MESSAGE ── */}
          {agent.first_message && (
            <Section title="First Message (Greeting)" delay={190} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            }>
              <div style={{ padding: '12px 16px', borderRadius: 9, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 13, color: '#374151', lineHeight: 1.7, fontStyle: 'italic' }}>
                &ldquo;{agent.first_message}&rdquo;
              </div>
            </Section>
          )}

          {/* ── 6. CALL SCRIPT ── */}
          {hasScript && (
            <Section title="Call Script" delay={230} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            }>
              {[
                { key: 'opener',             label: 'Opener' },
                { key: 'discovery',          label: 'Discovery' },
                { key: 'pitch',              label: 'Pitch' },
                { key: 'objection_handling', label: 'Objection Handling' },
                { key: 'closing',            label: 'Closing' },
                { key: 'faq',               label: 'FAQ' },
              ].map(({ key, label }, i) => {
                const text = agent.call_script?.[key as keyof typeof agent.call_script];
                return text ? <ScriptCard key={key} label={label} text={text} delay={i * 40} /> : null;
              })}
            </Section>
          )}

          {/* ── 7. TOOLS ── */}
          {hasTools && (
            <Section title={`Enabled Tools (${agent.enabled_tools.length})`} delay={270} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            }>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                {Object.entries(TYPE_COLOR).map(([type, color]) => (
                  <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#64748B' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    {type}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {agent.enabled_tools.map((t, i) => <ToolRow key={t} toolId={t} idx={i} />)}
              </div>
            </Section>
          )}

          {/* ── 8. ANALYSIS CRITERIA (EL Evaluation) ── */}
          {hasAnalysis && (
            <Section title={`Analysis Criteria (${agent.evaluation_criteria!.length})`} delay={310} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            }>
              <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 10, padding: '7px 10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                ElevenLabs evaluates these criteria after every call. Results appear in Call Log and Orders after the call ends.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agent.evaluation_criteria!.map((c, i) => (
                  <div key={c.id} style={{
                    padding: '11px 14px', borderRadius: 9,
                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                    animation: `badge-pop 0.3s ${i * 50}ms both`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{c.name}</span>
                      <span style={{
                        fontSize: 9.5, fontWeight: 600, color: '#64748B',
                        background: '#F1F5F9', border: '1px solid #E2E8F0',
                        padding: '1px 7px', borderRadius: 12, letterSpacing: '0.04em', textTransform: 'capitalize',
                      }}>{c.scope}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#64748B', lineHeight: 1.55 }}>
                      {c.conversation_goal_prompt}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── 9. QUALIFICATION CRITERIA ── */}
          {hasCriteria && (
            <Section title="Lead Qualification Criteria" delay={350} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            }>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 9, padding: '4px 14px' }}>
                {Object.entries(agent.qualification_criteria).map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              </div>
            </Section>
          )}

          {/* ── 10. PRODUCT CATALOG ── */}
          {hasCatalog && (
            <Section title={`Product Catalog (${agent.product_catalog.length} items)`} delay={390} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            }>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(agent.product_catalog as Record<string, unknown>[]).slice(0, 6).map((item, i) => (
                  <div key={i} style={{
                    padding: '9px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0',
                    fontSize: 11.5, color: '#374151', animation: `section-rise 0.35s ${i * 50}ms both`,
                  }}>
                    {typeof item === 'object' && item !== null
                      ? Object.entries(item).map(([k, v]) => (
                        <span key={k} style={{ marginRight: 12 }}>
                          <span style={{ color: '#94A3B8', fontSize: 10 }}>{k}: </span>{String(v)}
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
            marginTop: 8, paddingTop: 16,
            borderTop: '1px solid #E2E8F0',
            display: 'flex', gap: 12, fontSize: 10.5,
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
