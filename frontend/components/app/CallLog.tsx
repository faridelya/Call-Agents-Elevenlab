'use client';

import { useState } from 'react';
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
  if (score == null) return { label: 'neutral', color: '#3D607A' };
  if (score >= 0.65) return { label: 'positive', color: '#00D082' };
  if (score <= 0.35) return { label: 'negative', color: '#FF4D6D' };
  return { label: 'neutral', color: '#7BA5C8' };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = 12, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)',
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
        border: `1px solid ${active ? 'rgba(0,208,130,0.45)' : hov ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        background: active ? 'rgba(0,208,130,0.12)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        color: active ? '#00D082' : hov ? '#7BA5C8' : '#3D607A',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
      {count != null && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 9999,
          background: active ? 'rgba(0,208,130,0.22)' : 'rgba(255,255,255,0.07)',
          color: active ? '#00D082' : '#3D607A',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Transcript bubble ─────────────────────────────────────────────────────────
function Bubble({ role, text, timestamp }: { role: string; text: string; timestamp?: string }) {
  const isAgent = role === 'agent';
  const accentClr = isAgent ? '#00D082' : '#38BDF8';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-start' : 'flex-end', gap: 3 }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accentClr,
      }}>
        {isAgent ? 'Agent' : 'Customer'}
      </span>
      <div style={{
        maxWidth: '88%',
        background: isAgent ? 'rgba(0,208,130,0.07)' : 'rgba(56,189,248,0.07)',
        border: `1px solid ${isAgent ? 'rgba(0,208,130,0.15)' : 'rgba(56,189,248,0.12)'}`,
        borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '8px 12px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        {text}
      </div>
      {timestamp && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function CallDetail({ call, onClose }: { call: CallRecord; onClose: () => void }) {
  const [detail, setDetail] = useState<CallRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useState(() => {
    (async () => {
      try {
        const d = await apiFetch<CallRecord>(`/api/v1/calls/${call.id}`);
        setDetail(d);
      } catch { /* fall through */ }
      finally { setLoading(false); }
    })();
  });

  const isOut = call.direction === 'outbound';
  const contact = isOut ? call.to_number : call.from_number;
  const src = detail ?? call;
  const transcript = (src as any).transcript_entries ?? (src as any).transcript ?? [];
  const si = sentimentInfo(call.sentiment_score);
  const oc = getOutcomeColor(call.outcome);

  const statChips = [
    { l: 'Duration', v: fmtDuration(call.duration_seconds), c: '#38BDF8' },
    { l: 'Direction', v: isOut ? 'Outbound' : 'Inbound', c: isOut ? '#38BDF8' : '#00D082' },
    { l: 'Sentiment', v: si.label, c: si.color },
    { l: 'Outcome', v: getOutcomeLabel(call.outcome), c: oc },
    { l: 'Status', v: call.status ?? '—', c: '#00C2B8' },
  ];

  return (
    <div style={{
      width: 380, flexShrink: 0,
      background: 'rgba(7,16,30,0.97)',
      backdropFilter: 'blur(24px)',
      border: '1px solid rgba(0,208,130,0.10)',
      borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      animation: 'slide-in-right 0.3s var(--ease-out)',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {contact ?? '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              {call.agent_name ?? 'Unknown agent'} · {fmtDate(call.created_at)} {fmtTime(call.created_at)}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,109,0.12)'; e.currentTarget.style.color = '#FF4D6D'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
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
              <div style={{ fontSize: 8.5, color: c, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: c, marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Summary */}
      {(detail ?? call).auto_summary && (
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,208,130,0.04)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#00D082', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            AI Summary
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {(detail ?? call).auto_summary}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Transcript
          </div>
          {transcript.length > 0 && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
              background: 'rgba(0,208,130,0.10)', color: '#00D082', border: '1px solid rgba(0,208,130,0.20)',
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
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            No transcript available
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {transcript.map((e: any, i: number) => (
              <Bubble key={i} role={e.role} text={e.text ?? e.message ?? ''} timestamp={e.timestamp} />
            ))}
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
          ? '1.6fr 1.1fr 70px 90px 106px 56px'
          : '1.6fr 1.3fr 1fr 90px 120px 90px 60px',
        alignItems: 'center', padding: '11px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        background: selected ? 'rgba(0,208,130,0.06)' : hov ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background 0.12s',
        borderLeft: `2px solid ${selected ? '#00D082' : 'transparent'}`,
        animation: `fade-in 0.4s ${idx * 35}ms both`,
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {contact ?? '—'}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
          {call.id.slice(0, 8)}
        </div>
      </div>
      <div style={{ fontSize: 12, color: call.agent_name ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
        {call.agent_name ?? '—'}
      </div>
      <div>
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
          background: isOut ? 'rgba(56,189,248,0.10)' : 'rgba(0,208,130,0.10)',
          color: isOut ? '#38BDF8' : '#00D082',
          border: `1px solid ${isOut ? 'rgba(56,189,248,0.20)' : 'rgba(0,208,130,0.20)'}`,
          textTransform: 'uppercase',
        }}>
          {compact ? (isOut ? 'OUT' : 'IN') : call.direction}
        </span>
      </div>
      <div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fmtDate(call.created_at)}</div>
        <div style={{ fontSize: 10, color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{fmtTime(call.created_at)}</div>
      </div>
      <div>
        {call.outcome ? (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
            background: `${oc}12`, color: oc, border: `1px solid ${oc}22`, whiteSpace: 'nowrap',
          }}>
            {getOutcomeIcon(call.outcome)} {getOutcomeLabel(call.outcome)}
          </span>
        ) : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
      </div>
      {!compact && (
        <div style={{ fontSize: 11.5, fontWeight: 500, color: si.color, textTransform: 'capitalize' }}>
          {si.label}
        </div>
      )}
      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'right' }}>
        {fmtDuration(call.duration_seconds)}
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────
export function CallLogView() {
  const [page, setPage]         = useState(1);
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const [dirFilter, setDir]     = useState<DirFilter>('all');

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
            fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
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
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 9999, border: '1px solid rgba(255,255,255,0.07)',
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
                  width: 30, height: 30, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
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
                  width: 30, height: 30, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
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
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>

        {/* Table */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          background: 'rgba(9,20,38,0.60)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: selected
              ? '1.6fr 1.1fr 70px 90px 106px 56px'
              : '1.6fr 1.3fr 1fr 90px 120px 90px 60px',
            padding: '11px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)', flexShrink: 0,
          }}>
            {(selected
              ? ['Contact', 'Agent', 'Dir', 'Time', 'Outcome', 'Dur']
              : ['Contact', 'Agent', 'Direction', 'Time', 'Outcome', 'Sentiment', 'Dur']
            ).map((h) => (
              <span key={h} style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
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
                  gridTemplateColumns: '1.6fr 1.3fr 1fr 90px 120px 90px 60px',
                  padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)',
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

        {/* Detail panel */}
        {selected && <CallDetail call={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
