'use client';

import { useState, useEffect } from 'react';
import { useCalls } from '@/lib/hooks/useCalls';
import { apiFetch } from '@/lib/api';
import type { CallRecord } from '@/lib/api';
import { getOutcomeColor, getOutcomeLabel, getOutcomeIcon } from '@/lib/outcomeUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────
type DirFilter = 'all' | 'inbound' | 'outbound';

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

function sentimentInfo(score?: number): { label: string; color: string } {
  if (score == null) return { label: 'neutral', color: '#94A3B8' };
  if (score >= 0.65) return { label: 'positive', color: '#10B981' };
  if (score <= 0.35) return { label: 'negative', color: '#FF4D6D' };
  return { label: 'neutral', color: '#64748B' };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = 12, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)',
      backgroundSize: '800px 100%', animation: 'shimmer 1.8s infinite linear',
    }} />
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function FilterPill({ label, active, count, onClick }: {
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
        padding: '5px 13px', borderRadius: 9999,
        border: `1px solid ${active ? 'rgba(0,208,130,0.45)' : hov ? '#CBD5E1' : '#E2E8F0'}`,
        background: active ? 'rgba(0,208,130,0.12)' : hov ? '#F8FAFC' : 'transparent',
        color: active ? '#10B981' : hov ? '#64748B' : '#94A3B8',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
      {count != null && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 9999,
          background: active ? 'rgba(0,208,130,0.22)' : '#E2E8F0',
          color: active ? '#10B981' : '#94A3B8',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Transcript bubble ─────────────────────────────────────────────────────────
function Bubble({ role, text, timestamp, agentName }: {
  role: string; text: string; timestamp?: string; agentName?: string;
}) {
  const ts = timestamp
    ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  // System event (tool actions, transfer events) — centered divider style
  if (role === 'system') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '4px 0' }}>
        <div style={{
          background: 'rgba(124,110,250,0.08)', border: '1px solid rgba(124,110,250,0.22)',
          borderRadius: 8, padding: '7px 14px', maxWidth: '92%', textAlign: 'center',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7C6EFA', marginBottom: 3 }}>
            System Event
          </div>
          <div style={{ fontSize: 13, color: '#A89AF9', lineHeight: 1.55 }}>{text}</div>
        </div>
        {ts && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ts}</span>}
      </div>
    );
  }

  // Human agent leg — left-aligned, amber color
  if (role === 'human_agent') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#F59E0B' }}>
          Human Agent
        </span>
        <div style={{
          maxWidth: '88%',
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
          borderRadius: '4px 12px 12px 12px',
          padding: '9px 13px', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          {text}
        </div>
        {ts && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ts}</span>}
      </div>
    );
  }

  // AI agent or customer ('user' = live AI conv, 'customer' = diarized human leg)
  const isAgent = role === 'agent';
  const accentClr = isAgent ? '#10B981' : '#38BDF8';
  const label = isAgent ? (agentName ?? 'AI Agent') : 'Customer';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-start' : 'flex-end', gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accentClr }}>
        {label}
      </span>
      <div style={{
        maxWidth: '88%',
        background: isAgent ? 'rgba(0,208,130,0.07)' : 'rgba(56,189,248,0.07)',
        border: `1px solid ${isAgent ? '#CBD5E1' : 'rgba(56,189,248,0.12)'}`,
        borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '9px 13px', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        {text}
      </div>
      {ts && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ts}</span>}
    </div>
  );
}

// ─── Transfer-pending helpers ─────────────────────────────────────────────────
function hasTransferEvent(transcript: any[]): boolean {
  return transcript.some(e => e.role === 'system' && (e.text || '').includes('[Transfer]'));
}
function hasHumanLeg(transcript: any[]): boolean {
  return transcript.some(e => e.role === 'human_agent' || e.role === 'customer');
}
function isCallRecent(timestamp?: string, maxMs = 5 * 60 * 1000): boolean {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < maxMs;
}
type PendingPhase = 'transcribing' | 'classifying' | null;
function getPendingPhase(transcript: any[], outcome?: string, summary?: string, callTimestamp?: string): PendingPhase {
  if (!hasTransferEvent(transcript)) return null;
  if (!isCallRecent(callTimestamp)) return null; // older than 5 min → processing done or failed
  if (!hasHumanLeg(transcript)) return 'transcribing';
  if (!outcome || !summary) return 'classifying';
  return null;
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function CallDetail({ call, onClose, width }: { call: CallRecord; onClose: () => void; width: number }) {
  const [detail, setDetail] = useState<CallRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDetail(null);
    setLoading(true);
    (async () => {
      try {
        const d = await apiFetch<CallRecord>(`/api/v1/calls/${call.id}`);
        setDetail(d);
      } catch { /* fall through */ }
      finally { setLoading(false); }
    })();
  }, [call.id]);

  // Auto-poll while human-leg transcription or post-call classification is pending
  useEffect(() => {
    if (loading) return;
    const src = detail ?? call;
    const transcript: any[] = (src as any).transcript ?? [];
    const ts = (src as any).ended_at ?? (src as any).created_at ?? call.created_at;
    const phase = getPendingPhase(transcript, (src as any).outcome, (src as any).auto_summary, ts);
    if (!phase) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 22;
    const poll = async () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts++;
      try {
        const updated = await apiFetch<CallRecord>(`/api/v1/calls/${call.id}`);
        if (!cancelled) {
          setDetail(updated);
          const t: any[] = (updated as any).transcript ?? [];
          const uts = (updated as any).ended_at ?? (updated as any).created_at ?? call.created_at;
          const stillPending = getPendingPhase(t, (updated as any).outcome, (updated as any).auto_summary, uts);
          if (stillPending) setTimeout(poll, 8000);
        }
      } catch { if (!cancelled) setTimeout(poll, 8000); }
    };
    const timer = setTimeout(poll, 8000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loading, call.id, detail?.outcome, (detail as any)?.auto_summary]);

  const isOut = call.direction === 'outbound';
  const contact = isOut ? call.to_number : call.from_number;
  const src = detail ?? call;
  const transcript = (src as any).transcript_entries ?? (src as any).transcript ?? [];
  const callTs = (src as any).ended_at ?? (src as any).created_at ?? call.created_at;
  const pendingPhase = getPendingPhase(transcript, (src as any).outcome, (src as any).auto_summary, callTs);
  const si = sentimentInfo((src as any).sentiment_score ?? call.sentiment_score);
  const oc = getOutcomeColor((src as any).outcome ?? call.outcome);

  const statChips = [
    { l: 'Duration', v: fmtDuration((src as any).duration_seconds ?? call.duration_seconds), c: '#38BDF8' },
    { l: 'Direction', v: isOut ? 'Outbound' : 'Inbound', c: isOut ? '#38BDF8' : '#10B981' },
    { l: 'Sentiment', v: si.label, c: si.color },
    { l: 'Outcome', v: getOutcomeLabel((src as any).outcome ?? call.outcome), c: oc },
    { l: 'Status', v: (src as any).status ?? call.status ?? '—', c: '#06B6D4' },
  ];

  return (
    <div style={{
      width, flexShrink: 0,
      background: '#FFFFFF',
      backdropFilter: 'none',
      border: '1px solid #E2E8F0',
      borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      animation: 'slide-in-right 0.3s var(--ease-out)',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {contact ?? '—'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
              {call.agent_name ?? 'Unknown agent'} · {fmtDate(call.created_at)} {fmtTime(call.created_at)}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: '50%',
            background: '#F1F5F9', border: '1px solid #E2E8F0',
            cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,109,0.12)'; e.currentTarget.style.color = '#FF4D6D'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {statChips.map(({ l, v, c }) => (
            <div key={l} style={{
              background: `${c}0E`, border: `1px solid ${c}20`,
              borderRadius: 7, padding: '4px 9px',
            }}>
              <div style={{ fontSize: 10, color: c, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: c, marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Summary */}
      {(detail ?? call).auto_summary && (
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid #F1F5F9',
          background: 'rgba(16,185,129,0.04)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            AI Summary
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {(detail ?? call).auto_summary}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Transcript
          </div>
          {transcript.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
              background: 'rgba(0,208,130,0.10)', color: '#10B981', border: '1px solid rgba(0,208,130,0.20)',
            }}>
              {transcript.length} messages
            </span>
          )}
        </div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
                <Sk w="25%" h={8} />
                <Sk w="72%" h={44} r={10} />
              </div>
            ))}
          </div>
        ) : transcript.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13.5 }}>
            No transcript available
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {transcript.map((e: any, i: number) => (
              <Bubble key={i} role={e.role} text={e.text ?? e.message ?? ''} timestamp={e.timestamp} agentName={call.agent_name ?? undefined} />
            ))}
            {pendingPhase && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 11px', marginTop: 4,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)',
                borderRadius: 8,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  border: '1.5px solid rgba(245,158,11,0.3)', borderTopColor: '#F59E0B',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{ fontSize: 12, color: '#F59E0B' }}>
                  {pendingPhase === 'transcribing'
                    ? 'Human conversation is being transcribed — will update shortly.'
                    : 'Analyzing full conversation — summary updating shortly.'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Call row ─────────────────────────────────────────────────────────────────
function CallRow({ call, selected, compact, onSelect, idx }: {
  call: CallRecord; selected: boolean; compact: boolean; onSelect: () => void; idx: number;
}) {
  const [hov, setHov] = useState(false);
  const si = sentimentInfo(call.sentiment_score);
  const oc = getOutcomeColor(call.outcome);
  const isOut = call.direction === 'outbound';
  const contact = isOut ? call.to_number : call.from_number;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: compact
          ? '150px 145px 65px 85px 1fr 65px'
          : '150px 160px 90px 90px 1fr 85px 65px',
        alignItems: 'center', padding: '11px 20px',
        borderBottom: '1px solid #F1F5F9',
        cursor: 'pointer',
        background: selected ? 'rgba(0,208,130,0.06)' : hov ? '#F8FAFC' : 'transparent',
        transition: 'background 0.12s',
        borderLeft: `2px solid ${selected ? '#10B981' : 'transparent'}`,
        animation: `fade-in 0.4s ${idx * 35}ms both`,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {contact ?? '—'}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
          {call.id.slice(0, 8)}
        </div>
      </div>
      <div style={{ fontSize: 13, color: call.agent_name ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
        {call.agent_name ?? '—'}
      </div>
      <div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
          background: isOut ? 'rgba(56,189,248,0.10)' : 'rgba(0,208,130,0.10)',
          color: isOut ? '#38BDF8' : '#10B981',
          border: `1px solid ${isOut ? 'rgba(56,189,248,0.20)' : 'rgba(0,208,130,0.20)'}`,
          textTransform: 'uppercase',
        }}>
          {compact ? (isOut ? 'OUT' : 'IN') : call.direction}
        </span>
      </div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtDate(call.created_at)}</div>
        <div style={{ fontSize: 11, color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{fmtTime(call.created_at)}</div>
      </div>
      <div>
        {call.outcome ? (
          <span style={{
            fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
            background: `${oc}12`, color: oc, border: `1px solid ${oc}22`, whiteSpace: 'nowrap',
          }}>
            {getOutcomeIcon(call.outcome)} {getOutcomeLabel(call.outcome)}
          </span>
        ) : <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>—</span>}
      </div>
      {!compact && (
        <div style={{ fontSize: 13, fontWeight: 500, color: si.color, textTransform: 'capitalize' }}>
          {si.label}
        </div>
      )}
      <div style={{ fontSize: 13.5, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'right' }}>
        {fmtDuration(call.duration_seconds)}
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────
export function CallLogView() {
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<CallRecord | null>(null);
  const [dirFilter, setDir]       = useState<DirFilter>('all');
  const [panelWidth, setPanelWidth] = useState(380);

  const startPanelDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.min(700, Math.max(280, startW + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const { data, isLoading } = useCalls(
    page,
    undefined,
    dirFilter === 'all' ? undefined : dirFilter,
  );

  const callList   = data?.items ?? [];
  const totalCalls = data?.total ?? 0;
  const pages      = data?.pages ?? 1;

  function handleDir(f: DirFilter) { setDir(f); setPage(1); setSelected(null); }

  const inCnt  = callList.filter((c) => c.direction === 'inbound').length;
  const outCnt = callList.filter((c) => c.direction === 'outbound').length;

  return (
    <div style={{
      padding: '32px 36px', height: '100%', display: 'flex', flexDirection: 'column',
      gap: 20, boxSizing: 'border-box', overflow: 'hidden',
      animation: 'fade-in 0.4s both',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            Call History
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {totalCalls.toLocaleString()} total calls across all agents
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Direction filters */}
          <div style={{
            display: 'flex', gap: 4, padding: '4px',
            background: '#F8FAFC',
            borderRadius: 9999, border: '1px solid #E2E8F0',
          }}>
            <FilterPill label="All" active={dirFilter === 'all'} count={totalCalls} onClick={() => handleDir('all')} />
            <FilterPill label="Inbound" active={dirFilter === 'inbound'} count={dirFilter === 'all' ? inCnt : undefined} onClick={() => handleDir('inbound')} />
            <FilterPill label="Outbound" active={dirFilter === 'outbound'} count={dirFilter === 'all' ? outCnt : undefined} onClick={() => handleDir('outbound')} />
          </div>

          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                style={{
                  width: 30, height: 30, background: '#F8FAFC',
                  border: '1px solid #E2E8F0', borderRadius: 8,
                  color: page === 1 ? 'var(--text-disabled)' : 'var(--text-muted)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >‹</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 44, textAlign: 'center' }}>
                {page}/{pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                style={{
                  width: 30, height: 30, background: '#F8FAFC',
                  border: '1px solid #E2E8F0', borderRadius: 8,
                  color: page === pages ? 'var(--text-disabled)' : 'var(--text-muted)',
                  cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >›</button>
            </div>
          )}
        </div>
      </div>

      {/* Content row */}
      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0 }}>

        {/* Table */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          background: '#FFFFFF',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: '1px solid #E2E8F0',
          borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: selected
              ? '150px 145px 65px 85px 1fr 65px'
              : '150px 160px 90px 90px 1fr 85px 65px',
            padding: '11px 20px',
            borderBottom: '1px solid #F1F5F9',
            background: '#F8FAFC', flexShrink: 0,
          }}>
            {(selected
              ? ['Contact', 'Agent', 'Dir', 'Time', 'Outcome', 'Dur']
              : ['Contact', 'Agent', 'Direction', 'Time', 'Outcome', 'Sentiment', 'Dur']
            ).map((h) => (
              <span key={h} style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.09em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading ? (
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 160px 90px 90px 1fr 85px 65px',
                  padding: '12px 20px', borderBottom: '1px solid #F1F5F9',
                  gap: 0, alignItems: 'center',
                }}>
                  <div><Sk h={11} w="80%" /><div style={{ marginTop: 5 }} /><Sk h={8} w="40%" /></div>
                  <Sk h={11} w="65%" />
                  <Sk h={16} w="55%" r={9999} />
                  <Sk h={11} w="70%" />
                  <Sk h={18} w="80%" r={6} />
                  <Sk h={11} w="50%" />
                  <Sk h={11} w="45%" />
                </div>
              ))
            ) : callList.length === 0 ? (
              <div style={{ padding: '64px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 14 }}>📞</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No calls found</div>
                <div style={{ fontSize: 12, color: 'var(--text-disabled)', marginTop: 5 }}>
                  Initiate a call from an agent to see it here.
                </div>
              </div>
            ) : (
              callList.map((call, idx) => (
                <CallRow
                  key={call.id} call={call} idx={idx}
                  selected={selected?.id === call.id}
                  compact={!!selected}
                  onSelect={() => setSelected(selected?.id === call.id ? null : call)}
                />
              ))
            )}
          </div>
        </div>

        {/* Resize handle */}
        {selected && (
          <div
            onMouseDown={startPanelDrag}
            style={{
              width: 6, flexShrink: 0, cursor: 'col-resize', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', transition: 'background 0.15s', zIndex: 2,
              margin: '0 4px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,208,130,0.10)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              width: 2, height: 36, borderRadius: 2,
              background: 'rgba(0,0,0,0.12)',
              pointerEvents: 'none',
            }} />
          </div>
        )}

        {/* Detail panel */}
        {selected && <CallDetail call={selected} onClose={() => setSelected(null)} width={panelWidth} />}
      </div>
    </div>
  );
}
