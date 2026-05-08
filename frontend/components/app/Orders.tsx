'use client';

import { useState, useEffect } from 'react';
import { useCalls } from '@/lib/hooks/useCalls';
import { useAgents } from '@/lib/hooks/useAgents';
import { apiFetch } from '@/lib/api';
import type { CallRecord } from '@/lib/api';
import { getOutcomeColor, getOutcomeLabel, getOutcomeIcon } from '@/lib/outcomeUtils';

// ─── Transfer-pending helpers ─────────────────────────────────────────────────
function hasTransferEvent(t: any[]): boolean {
  return t.some(e => e.role === 'system' && (e.text || '').includes('[Transfer]'));
}
function hasHumanLeg(t: any[]): boolean {
  return t.some(e => e.role === 'human_agent' || e.role === 'customer');
}
function isCallRecent(timestamp?: string, maxMs = 5 * 60 * 1000): boolean {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < maxMs;
}
type PendingPhase = 'transcribing' | 'classifying' | null;
function getPendingPhase(t: any[], outcome?: string, summary?: string, callTimestamp?: string): PendingPhase {
  if (!hasTransferEvent(t)) return null;
  if (!isCallRecent(callTimestamp)) return null;
  if (!hasHumanLeg(t)) return 'transcribing';
  if (!outcome || !summary) return 'classifying';
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(secs?: number) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sentimentInfo(score?: number): { label: string; color: string } {
  if (score == null) return { label: '—', color: '#3D607A' };
  if (score >= 0.65) return { label: 'Positive', color: '#00D082' };
  if (score <= 0.35) return { label: 'Negative', color: '#FF4D6D' };
  return { label: 'Neutral', color: '#7BA5C8' };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = 14, r = 5 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)',
      backgroundSize: '800px 100%', animation: 'shimmer 1.8s infinite linear',
    }} />
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '5px 14px', borderRadius: 9999,
        border: `1px solid ${active ? 'rgba(0,208,130,0.45)' : hov ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        background: active ? 'rgba(0,208,130,0.12)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        color: active ? '#00D082' : hov ? '#7BA5C8' : '#3D607A',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ─── Chat transcript panel ────────────────────────────────────────────────────
function TranscriptPanel({ call, onClose }: { call: CallRecord; onClose: () => void }) {
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
    const t: any[] = (src as any).transcript ?? [];
    const ts = (src as any).ended_at ?? (src as any).created_at ?? call.created_at;
    const phase = getPendingPhase(t, (src as any).outcome, (src as any).auto_summary, ts);
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
          const ut: any[] = (updated as any).transcript ?? [];
          const uts = (updated as any).ended_at ?? (updated as any).created_at ?? call.created_at;
          const stillPending = getPendingPhase(ut, (updated as any).outcome, (updated as any).auto_summary, uts);
          if (stillPending) setTimeout(poll, 8000);
        }
      } catch { if (!cancelled) setTimeout(poll, 8000); }
    };
    const timer = setTimeout(poll, 8000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loading, call.id, detail?.outcome, (detail as any)?.auto_summary]);

  const src = detail ?? call;
  const si = sentimentInfo((src as any).sentiment_score ?? call.sentiment_score);
  const isOut = call.direction === 'outbound';
  const contact = isOut ? call.to_number : call.from_number;
  const transcript = (src as any).transcript_entries ?? (src as any).transcript ?? [];
  const callTs = (src as any).ended_at ?? (src as any).created_at ?? call.created_at;
  const pendingPhase = getPendingPhase(transcript, (src as any).outcome, (src as any).auto_summary, callTs);
  const oc = getOutcomeColor((src as any).outcome ?? call.outcome);
  const ol = getOutcomeLabel((src as any).outcome ?? call.outcome);

  return (
    <div style={{
      width: 440, minWidth: 440,
      background: 'rgba(7,16,30,0.97)',
      backdropFilter: 'blur(24px)',
      borderLeft: '1px solid rgba(0,208,130,0.12)',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      animation: 'slide-in-right 0.3s var(--ease-out)',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {contact ?? '—'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
              {call.agent_name ?? 'Unknown agent'} · {fmtDate(call.started_at)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,109,0.12)'; e.currentTarget.style.color = '#FF4D6D'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { l: 'Duration', v: fmtDuration(call.duration_seconds), c: '#38BDF8' },
            { l: 'Outcome', v: ol, c: oc },
            { l: 'Sentiment', v: si.label, c: si.color },
          ].map(({ l, v, c }) => (
            <div key={l} style={{
              background: `${c}10`, border: `1px solid ${c}20`,
              borderRadius: 8, padding: '5px 10px', textAlign: 'center',
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
          padding: '14px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
          background: 'rgba(0,208,130,0.04)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00D082', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
            AI Summary
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {(detail ?? call).auto_summary}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
                <Sk w="30%" h={8} />
                <Sk w="75%" h={40} r={12} />
              </div>
            ))}
          </div>
        ) : transcript.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13.5 }}>
            No transcript available
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {transcript.map((entry: any, i: number) => {
              const text = entry.text ?? entry.message ?? '';
              const ts = entry.timestamp
                ? new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : null;

              // System event — centered divider
              if (entry.role === 'system') {
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '4px 0', animation: `fade-in 0.3s ${i * 30}ms both` }}>
                    <div style={{
                      background: 'rgba(124,110,250,0.08)', border: '1px solid rgba(124,110,250,0.22)',
                      borderRadius: 8, padding: '7px 14px', maxWidth: '92%', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7C6EFA', marginBottom: 3 }}>System Event</div>
                      <div style={{ fontSize: 13, color: '#A89AF9', lineHeight: 1.55 }}>{text}</div>
                    </div>
                    {ts && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ts}</span>}
                  </div>
                );
              }

              // Human agent leg — left-aligned, amber
              if (entry.role === 'human_agent') {
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', animation: `fade-in 0.3s ${i * 30}ms both` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#F59E0B', marginBottom: 4 }}>Human Agent</div>
                    <div style={{
                      maxWidth: '85%',
                      background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
                      borderRadius: '4px 12px 12px 12px',
                      padding: '9px 13px', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55,
                    }}>
                      {text}
                    </div>
                    {ts && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{ts}</span>}
                  </div>
                );
              }

              // AI agent or customer
              const isAgent = entry.role === 'agent';
              const accentClr = isAgent ? '#00D082' : '#38BDF8';
              const label = isAgent ? (call.agent_name ?? 'AI Agent') : 'Customer';
              return (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isAgent ? 'flex-start' : 'flex-end',
                  animation: `fade-in 0.3s ${i * 30}ms both`,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: accentClr,
                    marginBottom: 4,
                  }}>
                    {label}
                    {ts && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400, textTransform: 'none', fontSize: 10.5 }}>
                        {ts}
                      </span>
                    )}
                  </div>
                  <div style={{
                    maxWidth: '85%',
                    background: isAgent ? 'rgba(0,208,130,0.07)' : 'rgba(56,189,248,0.07)',
                    border: `1px solid ${isAgent ? 'rgba(0,208,130,0.15)' : 'rgba(56,189,248,0.12)'}`,
                    borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                    padding: '9px 13px',
                    fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55,
                  }}>
                    {text}
                  </div>
                </div>
              );
            })}
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

// ─── Orders View ──────────────────────────────────────────────────────────────
type OutcomeFilter = 'all' | 'achieved' | 'followup' | 'rejected' | 'attempted';
type AgentFilter = string;

export function OrdersView() {
  const [page, setPage]               = useState(1);
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const [outcomeFilter, setOFil]      = useState<OutcomeFilter>('all');
  const [selected, setSelected]       = useState<CallRecord | null>(null);

  const { data: agentsData } = useAgents();
  const agentList = agentsData?.items ?? [];

  const { data, isLoading } = useCalls(
    page,
    agentFilter !== 'all' ? agentFilter : undefined,
  );

  const allCalls = data?.items ?? [];
  const POSITIVE = new Set(['goal_achieved','order_confirmed','agreed_on_service','appointment_booked','payment_collected','issue_resolved','interested','demo_scheduled']);
  const FOLLOWUP = new Set(['callback_requested','callback_scheduled','follow_up_needed','want_to_connect_later']);
  const DECLINED = new Set(['not_interested','not_qualified','do_not_call']);
  const NO_CONTACT = new Set(['voicemail_left','voicemail','no_answer','gatekeeper','call_disconnected','wrong_number']);

  const filteredCalls = allCalls.filter((c) => {
    if (outcomeFilter === 'all') return true;
    if (outcomeFilter === 'achieved') return POSITIVE.has(c.outcome ?? '');
    if (outcomeFilter === 'followup') return FOLLOWUP.has(c.outcome ?? '');
    if (outcomeFilter === 'rejected') return DECLINED.has(c.outcome ?? '');
    if (outcomeFilter === 'attempted') return NO_CONTACT.has(c.outcome ?? '');
    return true;
  });

  const total = data?.total ?? 0;

  const outcomeFilters: { id: OutcomeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'achieved', label: 'Achieved' },
    { id: 'followup', label: 'Follow-up' },
    { id: 'rejected', label: 'Declined' },
    { id: 'attempted', label: 'No Contact' },
  ];

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      animation: 'fade-in 0.4s both',
    }}>
      {/* Main table area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '32px 36px 20px', flexShrink: 0 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
                color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6,
              }}>
                Orders
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {total.toLocaleString()} call records · click any row to view conversation
              </p>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {outcomeFilters.map((f) => (
              <FilterPill key={f.id} label={f.label} active={outcomeFilter === f.id} onClick={() => { setOFil(f.id); setPage(1); }} />
            ))}
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
            <select
              value={agentFilter}
              onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }}
              style={{
                background: 'rgba(9,20,38,0.80)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 9999, padding: '5px 14px', fontSize: 12,
                color: agentFilter !== 'all' ? '#00D082' : '#3D607A',
                cursor: 'pointer', outline: 'none',
                borderColor: agentFilter !== 'all' ? 'rgba(0,208,130,0.35)' : 'rgba(255,255,255,0.10)',
              }}
            >
              <option value="all">All Agents</option>
              {agentList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 36px 24px' }}>
          <div style={{
            background: 'rgba(9,20,38,0.60)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '125px 150px 150px 155px 72px 82px 1fr',
              gap: 0,
              padding: '11px 20px',
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              {['Date', 'Customer', 'Agent', 'Status', 'Duration', 'Sentiment', 'Summary'].map((h) => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.09em', color: 'var(--text-muted)', paddingRight: 8,
                }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '125px 150px 150px 155px 72px 82px 1fr',
                  padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  gap: 0, alignItems: 'center',
                }}>
                  <Sk h={11} w="90%" />
                  <Sk h={11} w="80%" />
                  <Sk h={11} w="60%" />
                  <Sk h={18} w="75%" r={9999} />
                  <Sk h={11} w="50%" />
                  <Sk h={11} w="55%" />
                  <Sk h={11} w="85%" />
                </div>
              ))
            ) : filteredCalls.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No orders found for the selected filters
              </div>
            ) : (
              filteredCalls.map((call, idx) => (
                <OrderRow
                  key={call.id} call={call} idx={idx}
                  selected={selected?.id === call.id}
                  onClick={() => setSelected(selected?.id === call.id ? null : call)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: 12, marginTop: 20,
            }}>
              <PaginationBtn label="← Previous" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <PaginationBtn label="Next →" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 20)} />
            </div>
          )}
        </div>
      </div>

      {/* Transcript panel */}
      {selected && (
        <TranscriptPanel call={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function OrderRow({ call, idx, selected, onClick }: {
  call: CallRecord; idx: number; selected: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const isOut = call.direction === 'outbound';
  const contact = isOut ? call.to_number : call.from_number;
  const si = sentimentInfo(call.sentiment_score);
  const oc = getOutcomeColor(call.outcome);
  const ol = getOutcomeLabel(call.outcome);
  const oi = call.outcome ? getOutcomeIcon(call.outcome) : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '125px 150px 150px 155px 72px 82px 1fr',
        padding: '13px 20px', alignItems: 'center', gap: 0,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: selected
          ? 'rgba(0,208,130,0.07)'
          : hov ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderLeft: selected ? '2px solid #00D082' : '2px solid transparent',
        cursor: 'pointer', transition: 'all 0.15s',
        animation: `fade-in 0.4s ${idx * 40}ms both`,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingRight: 8 }}>
        {fmtDate(call.started_at)}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--text-primary)', paddingRight: 8 }}>
        {contact ?? '—'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {call.agent_name ?? '—'}
      </div>
      <div style={{ paddingRight: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
          background: `${oc}15`, color: oc, border: `1px solid ${oc}30`, whiteSpace: 'nowrap',
        }}>
          {oi && <span style={{ fontSize: 10 }}>{oi}</span>}
          {ol}
        </span>
      </div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', paddingRight: 8 }}>
        {fmtDuration(call.duration_seconds)}
      </div>
      <div style={{ paddingRight: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: si.color }}>
          {si.label}
        </span>
      </div>
      <div style={{
        fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {call.auto_summary ? call.auto_summary.slice(0, 80) + (call.auto_summary.length > 80 ? '…' : '') : '—'}
      </div>
    </div>
  );
}

function PaginationBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: '6px 14px', borderRadius: 8,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
        fontSize: 12, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}
