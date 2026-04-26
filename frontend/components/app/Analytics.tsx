'use client';

import { useState } from 'react';
import {
  useAnalyticsOverview,
  useCallsOverTime,
  useOutcomeDistribution,
  useAgentMetrics,
} from '@/lib/hooks/useAnalytics';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(secs: number) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function sentimentColor(score?: number) {
  if (score == null) return '#3D607A';
  if (score >= 0.65) return '#00D082';
  if (score <= 0.35) return '#FF4D6D';
  return '#7BA5C8';
}
function sentimentLabel(score?: number) {
  if (score == null) return '—';
  if (score >= 0.65) return 'Positive';
  if (score <= 0.35) return 'Negative';
  return 'Neutral';
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

// ─── Glass Card ───────────────────────────────────────────────────────────────
function GCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'rgba(9,20,38,0.60)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: `1px solid ${hov ? 'rgba(0,208,130,0.18)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16, overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov
          ? '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'all 0.25s var(--ease-out)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend, accent = '#00D082', delay = 0 }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; accent?: string; delay?: number;
}) {
  return (
    <GCard style={{ padding: '22px 24px', animation: `fade-in 0.5s ${delay}ms both` } as any}>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 100, height: 100,
        background: `radial-gradient(circle at 100% 0%, ${accent}12 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)', lineHeight: 1, marginBottom: 8,
        textShadow: `0 0 20px ${accent}30`,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 11, color: trend === 'up' ? '#00D082' : trend === 'down' ? '#FF4D6D' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {trend === 'up' && <span style={{ fontSize: 10 }}>↑</span>}
          {trend === 'down' && <span style={{ fontSize: 10 }}>↓</span>}
          {sub}
        </div>
      )}
    </GCard>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
interface BarData { l: string; v: number; c?: string; }

function BarChart({ data, height = 100, color = '#00D082' }: {
  data: BarData[]; height?: number; color?: string;
}) {
  const max = Math.max(...data.map((d) => d.v), 1);
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height }}>
      {data.map((d, i) => {
        const pct = (d.v / max) * 0.88;
        const c = d.c ?? color;
        const active = hovIdx === i;
        return (
          <div
            key={i}
            onMouseEnter={() => setHovIdx(i)}
            onMouseLeave={() => setHovIdx(null)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 5, cursor: 'default',
            }}
          >
            {active && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: c,
                background: `${c}15`, border: `1px solid ${c}30`,
                borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap',
              }}>
                {d.v}
              </div>
            )}
            <div style={{
              width: '100%', borderRadius: '4px 4px 0 0',
              height: `${pct * height}px`,
              background: active
                ? `linear-gradient(to top, ${c}, ${c}bb)`
                : `linear-gradient(to top, ${c}60, ${c}30)`,
              boxShadow: active ? `0 0 12px ${c}40` : 'none',
              transition: 'all 0.2s var(--ease-out)',
              minHeight: 2,
            }} />
            <span style={{
              fontSize: 9, color: active ? c : 'var(--text-muted)',
              whiteSpace: 'nowrap', transition: 'color 0.15s',
            }}>
              {d.l}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Donut / funnel ───────────────────────────────────────────────────────────
function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ marginBottom: 10 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: hov ? color : 'var(--text-secondary)', transition: 'color 0.15s' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: hov ? color : 'var(--text-muted)', fontWeight: 600, transition: 'color 0.15s' }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, ${color}99)`,
          borderRadius: 9999,
          boxShadow: hov ? `0 0 8px ${color}50` : 'none',
          transition: 'box-shadow 0.2s',
        }} />
      </div>
    </div>
  );
}

// ─── Analytics View ───────────────────────────────────────────────────────────
export function AnalyticsView() {
  const [range, setRange] = useState<'day' | 'week'>('day');

  const { data: overview, isLoading: ovLoad } = useAnalyticsOverview();
  const { data: callsTime, isLoading: ctLoad } = useCallsOverTime(range);
  const { data: outcomes, isLoading: ouLoad }  = useOutcomeDistribution();
  const { data: agentMet, isLoading: amLoad }  = useAgentMetrics();

  const callsBarData = (callsTime?.data ?? []).slice(-14).map((d: any) => ({
    l: range === 'day'
      ? new Date(d.period).toLocaleDateString('en-US', { weekday: 'short' })
      : `W${Math.ceil(new Date(d.period).getDate() / 7)}`,
    v: d.count,
  }));

  const outcomePairs = (outcomes?.outcomes ?? []).slice(0, 8).map((o: any) => ({
    l: o.outcome.replace(/_/g, ' ').slice(0, 6),
    v: o.count,
    c: ({
      interested: '#00D082',
      callback_scheduled: '#38BDF8',
      not_interested: '#FF4D6D',
      voicemail_left: '#3D607A',
      completed: '#00C2B8',
      no_answer: '#3D607A',
      do_not_call: '#FF4D6D',
      busy: '#F0B429',
    } as Record<string, string>)[o.outcome] ?? '#3D607A',
  }));

  const funnelItems = [
    { label: 'Total Calls', value: overview?.total_calls ?? 0, color: '#38BDF8' },
    { label: 'Connected', value: overview?.completed_calls ?? 0, color: '#00C2B8' },
    { label: 'Interested', value: overview?.interested_outcomes ?? 0, color: '#00D082' },
    { label: 'Qualified Leads', value: overview?.qualified_leads ?? 0, color: '#F0B429' },
  ];

  const agentList = agentMet?.agents ?? [];

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', animation: 'fade-in 0.4s both' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            Analytics
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>All time · All agents</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['day', 'week'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '6px 14px', borderRadius: 8,
                background: range === r ? 'rgba(0,208,130,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${range === r ? 'rgba(0,208,130,0.35)' : 'rgba(255,255,255,0.08)'}`,
                color: range === r ? '#00D082' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}
            >
              {r === 'day' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {ovLoad ? (
          Array.from({ length: 4 }).map((_, i) => (
            <GCard key={i} style={{ padding: '22px 24px', height: 110 }}>
              <Sk h={10} w="55%" /><div style={{ marginTop: 14 }} /><Sk h={28} w="65%" />
            </GCard>
          ))
        ) : (
          <>
            <StatCard label="Total Calls" value={overview?.total_calls?.toLocaleString() ?? '0'}
              sub={`${overview?.completed_calls ?? 0} completed`} trend="up" accent="#00D082" delay={0} />
            <StatCard label="Avg Duration" value={fmtDuration(overview?.avg_call_duration_seconds ?? 0)}
              accent="#38BDF8" delay={60} />
            <StatCard label="Conversion Rate" value={`${overview?.conversion_rate ?? 0}%`}
              sub={`${overview?.interested_outcomes ?? 0} interested`} trend="up" accent="#00C2B8" delay={120} />
            <StatCard label="Qualified Leads" value={String(overview?.qualified_leads ?? 0)}
              sub={`of ${overview?.total_leads ?? 0} total`} trend="up" accent="#F0B429" delay={180} />
          </>
        )}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Calls over time */}
        <GCard style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                Calls Over Time
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {range === 'day' ? 'Last 14 days' : 'By week'}
              </div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 9999,
              background: 'rgba(0,208,130,0.10)', color: '#00D082', border: '1px solid rgba(0,208,130,0.22)',
            }}>
              {callsBarData.reduce((s, d) => s + d.v, 0)} calls
            </div>
          </div>
          {ctLoad ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: `${30 + Math.random() * 70}%`, borderRadius: '3px 3px 0 0', background: 'rgba(255,255,255,0.05)', animation: `shimmer 1.8s ${i*0.06}s infinite linear` }} />
              ))}
            </div>
          ) : callsBarData.length === 0 ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No data yet
            </div>
          ) : (
            <BarChart data={callsBarData} height={120} color="#00D082" />
          )}
        </GCard>

        {/* Outcome distribution */}
        <GCard style={{ padding: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Call Outcomes
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 18 }}>Distribution</div>
          {ouLoad ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: `${30 + Math.random() * 70}%`, background: 'rgba(255,255,255,0.05)', borderRadius: '3px 3px 0 0' }} />
              ))}
            </div>
          ) : outcomePairs.length === 0 ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No outcomes yet
            </div>
          ) : (
            <BarChart data={outcomePairs} height={120} />
          )}
        </GCard>
      </div>

      {/* Funnel + Agent table */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        {/* Lead funnel */}
        <GCard style={{ padding: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Lead Funnel</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 18 }}>New → Converted</div>
          {ovLoad ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <Sk h={10} w="60%" /><div style={{ marginTop: 6 }} /><Sk h={5} r={9999} />
              </div>
            ))
          ) : (
            funnelItems.map((item) => (
              <FunnelBar key={item.label} label={item.label} value={item.value}
                max={overview?.total_calls ?? 1} color={item.color} />
            ))
          )}
        </GCard>

        {/* Per-agent table */}
        <GCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 14px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
              Agent Performance
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Per-agent breakdown</div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 80px 80px 80px 90px 90px 80px',
            padding: '8px 24px',
            background: 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            {['Agent','Calls','Achieved','Rejected','Voicemails','Avg Dur','Sentiment','Conv %'].map((h) => (
              <div key={h} style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)',
              }}>
                {h}
              </div>
            ))}
          </div>
          {amLoad ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 90px 90px 80px',
                padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 0,
              }}>
                <Sk h={11} w="70%" />
                {Array.from({ length: 7 }).map((_, j) => <Sk key={j} h={11} w="50%" />)}
              </div>
            ))
          ) : agentList.length === 0 ? (
            <div style={{ padding: '30px 24px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              No agent data yet
            </div>
          ) : (
            agentList.map((a: any, idx: number) => {
              const sc = sentimentColor(a.avg_sentiment ?? a.avg_sentiment_score);
              return (
                <div
                  key={a.agent_id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 90px 90px 80px',
                    padding: '11px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    animation: `fade-in 0.4s ${idx*60}ms both`,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.agent_name ?? 'Unknown'}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{a.total_calls ?? 0}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#00D082' }}>{a.achieved ?? a.interested_outcomes ?? 0}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#FF4D6D' }}>{a.rejected ?? 0}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#3D607A' }}>{a.voicemails ?? 0}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmtDuration(a.avg_duration_seconds ?? 0)}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: sc }}>{sentimentLabel(a.avg_sentiment ?? a.avg_sentiment_score)}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#00C2B8' }}>{a.conversion_rate ?? 0}%</div>
                </div>
              );
            })
          )}
        </GCard>
      </div>
    </div>
  );
}
