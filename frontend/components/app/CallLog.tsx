'use client';

import { useState } from 'react';
import { useCalls } from '@/lib/hooks/useCalls';
import type { CallRecord } from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DirectionFilter = 'all' | 'inbound' | 'outbound';

function fmtDuration(secs?: number) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function sentimentLabel(score?: number): { label: string; color: string } {
  if (score == null) return { label: 'neutral', color: '#64748B' };
  if (score >= 0.65) return { label: 'positive', color: '#10B981' };
  if (score <= 0.35) return { label: 'negative', color: '#EF4444' };
  return { label: 'neutral', color: '#64748B' };
}

const outcomeColor: Record<string, string> = {
  interested: '#10B981',
  callback_scheduled: '#7C6EFA',
  not_interested: '#EF4444',
  voicemail_left: '#475569',
  wrong_number: '#334155',
  do_not_call: '#EF4444',
  completed: '#22D3EE',
};

function outcomeLabel(o?: string) {
  if (!o) return '—';
  return o.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Direction pill ───────────────────────────────────────────────────────────

function DirPill({ label, active, count, onClick }: {
  label: string; active: boolean; count?: number; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 14px', borderRadius: 9999,
        border: `1px solid ${active ? 'rgba(124,110,250,0.45)' : hov ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        background: active ? 'rgba(124,110,250,0.14)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        color: active ? '#A89AF9' : hov ? '#94A3B8' : '#475569',
        fontFamily: 'var(--font-inter), sans-serif',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.15s', letterSpacing: '0.02em',
      }}
    >
      {label}
      {count != null && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 9999,
          background: active ? 'rgba(124,110,250,0.25)' : 'rgba(255,255,255,0.06)',
          color: active ? '#A89AF9' : '#475569',
        }}>{count}</span>
      )}
    </button>
  );
}

// ─── Transcript bubble ────────────────────────────────────────────────────────

function Bubble({ role, text, timestamp }: { role: string; text: string; timestamp?: string }) {
  const isAgent = role === 'agent';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-start' : 'flex-end', gap: 3 }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        fontFamily: 'var(--font-inter), sans-serif',
        color: isAgent ? '#A89AF9' : '#22D3EE',
      }}>
        {isAgent ? 'Agent' : 'Customer'}
      </span>
      <div style={{
        maxWidth: '86%',
        background: isAgent ? 'rgba(124,110,250,0.1)' : 'rgba(34,211,238,0.08)',
        border: `1px solid ${isAgent ? 'rgba(124,110,250,0.18)' : 'rgba(34,211,238,0.13)'}`,
        borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '8px 12px', fontSize: 12, color: '#CBD5E1', lineHeight: 1.65,
        fontFamily: 'var(--font-inter), sans-serif',
      }}>
        {text}
      </div>
      {timestamp && (
        <span style={{ fontSize: 9, color: '#334155', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
          {new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function CallLogView() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('all');

  const { data, isLoading } = useCalls(
    page,
    undefined,
    dirFilter === 'all' ? undefined : dirFilter,
  );

  const callList = data?.items ?? [];
  const totalCalls = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  function handleDir(f: DirectionFilter) {
    setDirFilter(f);
    setPage(1);
    setSelected(null);
  }

  const inboundCount = callList.filter((c) => c.direction === 'inbound').length;
  const outboundCount = callList.filter((c) => c.direction === 'outbound').length;

  return (
    <div style={{ padding: '28px 32px', height: '100%', display: 'flex', flexDirection: 'column', gap: 20, boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', marginBottom: 3 }}>
            Call History
          </h1>
          <p style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-inter), sans-serif' }}>
            {totalCalls.toLocaleString()} total calls across all agents
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Direction filter pills */}
          <div style={{ display: 'flex', gap: 6, padding: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.06)' }}>
            <DirPill label="All Calls" active={dirFilter === 'all'} count={totalCalls} onClick={() => handleDir('all')} />
            <DirPill label="Inbound" active={dirFilter === 'inbound'} count={dirFilter === 'all' ? inboundCount : undefined} onClick={() => handleDir('inbound')} />
            <DirPill label="Outbound" active={dirFilter === 'outbound'} count={dirFilter === 'all' ? outboundCount : undefined} onClick={() => handleDir('outbound')} />
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ width: 30, height: 30, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: page === 1 ? '#334155' : '#64748B', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <span style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-jetbrains-mono), monospace', minWidth: 40, textAlign: 'center' }}>{page}/{pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} style={{ width: 30, height: 30, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: page === pages ? '#334155' : '#64748B', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content row ── */}
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>

        {/* Table */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: selected ? '1.6fr 1.2fr 80px 96px 100px 64px' : '1.6fr 1.4fr 1fr 96px 120px 90px 66px',
            padding: '11px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: '#0C1120',
            flexShrink: 0,
          }}>
            {(selected
              ? ['Contact', 'Agent', 'Dir', 'Time', 'Outcome', 'Dur']
              : ['Contact', 'Agent', 'Direction', 'Time', 'Outcome', 'Sentiment', 'Dur']
            ).map((h) => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#334155', fontFamily: 'var(--font-inter), sans-serif' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: '#334155', fontSize: 13, fontFamily: 'var(--font-inter)' }}>Loading calls…</div>
            ) : callList.length === 0 ? (
              <div style={{ padding: '64px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 12 }}>📞</div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-inter)', color: '#475569' }}>No calls found</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-inter)', color: '#334155', marginTop: 4 }}>Initiate a call from an agent to get started.</div>
              </div>
            ) : (
              callList.map((call) => (
                <CallRow
                  key={call.id}
                  call={call}
                  selected={selected?.id === call.id}
                  compact={!!selected}
                  onSelect={() => setSelected(selected?.id === call.id ? null : call)}
                />
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selected && <CallDetail call={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

// ─── Call row ─────────────────────────────────────────────────────────────────

function CallRow({ call, selected, compact, onSelect }: {
  call: CallRecord; selected: boolean; compact: boolean; onSelect: () => void;
}) {
  const [hov, setHov] = useState(false);
  const { label: sentLabel, color: sentColor } = sentimentLabel(call.sentiment_score);
  const oColor = outcomeColor[call.outcome ?? ''] ?? '#475569';
  const contact = call.direction === 'inbound' ? call.from_number : call.to_number;

  const cols = compact
    ? '1.6fr 1.2fr 80px 96px 100px 64px'
    : '1.6fr 1.4fr 1fr 96px 120px 90px 66px';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: cols, alignItems: 'center',
        padding: '11px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        background: selected ? 'rgba(124,110,250,0.07)' : hov ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background 0.12s',
        borderLeft: selected ? '2px solid #7C6EFA' : '2px solid transparent',
      }}
    >
      {/* Contact */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#E2E8F0', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{contact ?? '—'}</div>
        <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 1 }}>{call.id.slice(0, 8)}</div>
      </div>

      {/* Agent */}
      <div style={{ fontSize: 12, color: call.agent_name ? '#94A3B8' : '#334155', fontFamily: 'var(--font-inter), sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>
        {call.agent_name ?? '—'}
      </div>

      {/* Direction */}
      <div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: compact ? '2px 6px' : '3px 9px', borderRadius: 9999,
          background: call.direction === 'inbound' ? 'rgba(34,211,238,0.1)' : 'rgba(124,110,250,0.1)',
          color: call.direction === 'inbound' ? '#22D3EE' : '#A89AF9',
          textTransform: 'uppercase', fontFamily: 'var(--font-inter), sans-serif',
          border: `1px solid ${call.direction === 'inbound' ? 'rgba(34,211,238,0.18)' : 'rgba(124,110,250,0.18)'}`,
          letterSpacing: '0.04em',
        }}>
          {compact ? (call.direction === 'inbound' ? 'In' : 'Out') : call.direction}
        </span>
      </div>

      {/* Time */}
      <div>
        <div style={{ fontSize: 12, color: '#64748B', fontFamily: 'var(--font-inter), sans-serif' }}>{fmtDate(call.created_at)}</div>
        <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 1 }}>{fmtTime(call.created_at)}</div>
      </div>

      {/* Outcome */}
      <div>
        {call.outcome ? (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: `${oColor}13`, color: oColor, border: `1px solid ${oColor}22`, fontFamily: 'var(--font-inter), sans-serif', whiteSpace: 'nowrap' }}>
            {outcomeLabel(call.outcome)}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#334155' }}>—</span>
        )}
      </div>

      {/* Sentiment — hidden in compact */}
      {!compact && (
        <div style={{ fontSize: 11, fontWeight: 500, color: sentColor, textTransform: 'capitalize', fontFamily: 'var(--font-inter), sans-serif' }}>
          {sentLabel}
        </div>
      )}

      {/* Duration */}
      <div style={{ fontSize: 12, color: '#64748B', fontFamily: 'var(--font-jetbrains-mono), monospace', textAlign: 'right' }}>
        {fmtDuration(call.duration_seconds)}
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function CallDetail({ call, onClose }: { call: CallRecord; onClose: () => void }) {
  const { label: sentLabel, color: sentColor } = sentimentLabel(call.sentiment_score);
  const contact = call.direction === 'inbound' ? call.from_number : call.to_number;
  const oColor = outcomeColor[call.outcome ?? ''] ?? '#64748B';

  return (
    <div style={{
      width: 360, flexShrink: 0,
      background: '#0A0F1E', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{ padding: '15px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0C1120', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', fontFamily: 'var(--font-jetbrains-mono), monospace', marginBottom: 5 }}>{contact ?? '—'}</div>
            {call.agent_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 9999, background: 'rgba(124,110,250,0.1)', border: '1px solid rgba(124,110,250,0.2)', fontSize: 10, color: '#A89AF9', fontFamily: 'var(--font-inter), sans-serif', fontWeight: 600 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                {call.agent_name}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 20, lineHeight: 1, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>×</button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, flexShrink: 0 }}>
        {[
          ['Duration', fmtDuration(call.duration_seconds), '#F1F5F9'],
          ['Direction', call.direction, call.direction === 'inbound' ? '#22D3EE' : '#A89AF9'],
          ['Sentiment', sentLabel, sentColor],
          ['Outcome', outcomeLabel(call.outcome), oColor],
          ['Status', call.status, '#64748B'],
          ['Talk Ratio', call.talk_ratio != null ? `${Math.round(call.talk_ratio * 100)}%` : '—', '#F1F5F9'],
        ].map(([k, v, c]) => (
          <div key={String(k)} style={{ background: '#080B14', borderRadius: 8, padding: '9px 10px' }}>
            <div style={{ fontSize: 9, color: '#334155', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-inter)', marginBottom: 4 }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: String(c), textTransform: 'capitalize', fontFamily: 'var(--font-inter)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {call.auto_summary && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', fontFamily: 'var(--font-inter)', marginBottom: 8 }}>AI Summary</div>
          <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.7, fontFamily: 'var(--font-inter)', background: '#060910', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.04)' }}>
            {call.auto_summary}
          </div>
        </div>
      )}

      {/* Transcript */}
      {call.transcript && call.transcript.length > 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 16px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', fontFamily: 'var(--font-inter)' }}>Transcript</span>
            <span style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-jetbrains-mono)' }}>{call.transcript.length} msgs</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {call.transcript.map((entry, i) => (
              <Bubble key={i} role={entry.role} text={entry.text} timestamp={entry.timestamp} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, color: '#334155', fontFamily: 'var(--font-inter)' }}>No transcript available</div>
        </div>
      )}
    </div>
  );
}
