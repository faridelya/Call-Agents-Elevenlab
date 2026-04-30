'use client';

import { useState } from 'react';
import {
  useAnalyticsOverview,
  useCallsOverTime,
  useOutcomeDistribution,
  useAgentMetrics,
  useCampaignOutcomes,
} from '@/lib/hooks/useAnalytics';

// ─── Outcome registry ─────────────────────────────────────────────────────────
const OUTCOME_META: Record<string, { label: string; color: string; icon: string }> = {
  // Goal achieved
  goal_achieved:         { label: 'Goal Achieved',       color: '#00D082', icon: '★' },
  order_confirmed:       { label: 'Order Confirmed',     color: '#00C2B8', icon: '✦' },
  agreed_on_service:     { label: 'Agreed on Service',   color: '#00D082', icon: '◆' },
  appointment_booked:    { label: 'Appointment Booked',  color: '#00C2B8', icon: '◈' },
  payment_collected:     { label: 'Payment Collected',   color: '#00D082', icon: '◉' },
  issue_resolved:        { label: 'Issue Resolved',      color: '#00C2B8', icon: '●' },
  // Positive progress
  interested:            { label: 'Interested',          color: '#38BDF8', icon: '◆' },
  demo_scheduled:        { label: 'Demo Scheduled',      color: '#7C6EFA', icon: '◈' },
  // Follow-up
  callback_requested:    { label: 'Callback Requested',  color: '#7C6EFA', icon: '◉' },
  callback_scheduled:    { label: 'Callback Scheduled',  color: '#7C6EFA', icon: '◉' },
  follow_up_needed:      { label: 'Follow-up Needed',    color: '#A89AF9', icon: '◎' },
  want_to_connect_later: { label: 'Connect Later',       color: '#7C6EFA', icon: '◈' },
  // Incomplete contact
  voicemail_left:        { label: 'Voicemail Left',      color: '#A89AF9', icon: '◎' },
  voicemail:             { label: 'Voicemail',           color: '#A89AF9', icon: '◎' },
  no_answer:             { label: 'No Answer',           color: '#3D607A', icon: '○' },
  gatekeeper:            { label: 'Gatekeeper',          color: '#F0B429', icon: '◇' },
  // Declined
  not_interested:        { label: 'Not Interested',      color: '#FF4D6D', icon: '✕' },
  not_qualified:         { label: 'Not Qualified',       color: '#FF4D6D', icon: '⊗' },
  // Administrative
  do_not_call:           { label: 'Do Not Call',         color: '#FF4D6D', icon: '⊘' },
  wrong_number:          { label: 'Wrong Number',        color: '#F0B429', icon: '◇' },
  call_disconnected:     { label: 'Disconnected',        color: '#3D607A', icon: '○' },
  completed:             { label: 'Completed',           color: '#00C2B8', icon: '●' },
  no_outcome:            { label: 'No Outcome',          color: '#2A3F55', icon: '·' },
};

function outcomeColor(o: string)  { return OUTCOME_META[o]?.color  ?? '#3D607A'; }
function outcomeLabel(o: string)  { return OUTCOME_META[o]?.label  ?? o.replace(/_/g, ' '); }
function outcomeIcon(o: string)   { return OUTCOME_META[o]?.icon   ?? '●'; }

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
function GCard({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'rgba(9,20,38,0.60)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: `1px solid ${hov ? (glow ? `${glow}28` : 'rgba(0,208,130,0.18)') : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16, overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov
          ? `0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)${glow ? `, 0 0 24px ${glow}10` : ''}`
          : '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'all 0.25s ease-out',
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
    <GCard glow={accent} style={{ padding: '22px 24px', animation: `fade-in 0.5s ${delay}ms both`, position: 'relative' } as any}>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 110, height: 110,
        background: `radial-gradient(circle at 100% 0%, ${accent}14 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)', lineHeight: 1, marginBottom: 8,
        textShadow: `0 0 24px ${accent}35`,
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
function BarChart({ data, height = 100 }: { data: { l: string; v: number; c?: string }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height }}>
      {data.map((d, i) => {
        const pct = (d.v / max) * 0.88;
        const c = d.c ?? '#00D082';
        const active = hovIdx === i;
        return (
          <div
            key={i}
            onMouseEnter={() => setHovIdx(i)}
            onMouseLeave={() => setHovIdx(null)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'default' }}
          >
            {active && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: c,
                background: `${c}18`, border: `1px solid ${c}35`,
                borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap',
              }}>
                {d.v}
              </div>
            )}
            <div style={{
              width: '100%', borderRadius: '4px 4px 0 0',
              height: `${pct * height}px`,
              background: active ? `linear-gradient(to top, ${c}, ${c}bb)` : `linear-gradient(to top, ${c}65, ${c}32)`,
              boxShadow: active ? `0 0 12px ${c}45` : 'none',
              transition: 'all 0.2s ease-out', minHeight: 2,
            }} />
            <span style={{ fontSize: 9, color: active ? c : 'var(--text-muted)', whiteSpace: 'nowrap', transition: 'color 0.15s' }}>
              {d.l}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Funnel Bar ───────────────────────────────────────────────────────────────
function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: hov ? color : 'var(--text-secondary)', transition: 'color 0.15s' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: hov ? color : 'var(--text-muted)', fontWeight: 600, transition: 'color 0.15s' }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, ${color}99)`,
          borderRadius: 9999,
          boxShadow: hov ? `0 0 8px ${color}55` : 'none',
          transition: 'box-shadow 0.2s',
        }} />
      </div>
    </div>
  );
}

// ─── Styled Select ────────────────────────────────────────────────────────────
function StyledSelect({ value, onChange, children, placeholder }: {
  value: string; onChange: (v: string) => void;
  children: React.ReactNode; placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', appearance: 'none', WebkitAppearance: 'none',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 9, padding: '7px 32px 7px 12px',
          fontSize: 12, color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: 'pointer', outline: 'none',
          fontFamily: 'var(--font-ui)',
          transition: 'border-color 0.15s',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,208,130,0.4)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <span style={{
        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-muted)', fontSize: 10, pointerEvents: 'none',
      }}>▾</span>
    </div>
  );
}

// ─── Campaign Outcomes Card ───────────────────────────────────────────────────
function CampaignOutcomesCard() {
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedAgent, setSelectedAgent]       = useState('');

  const { data, isLoading } = useCampaignOutcomes(
    selectedCampaign || undefined,
    selectedAgent    || undefined,
  );

  const outcomes   = data?.outcomes   ?? [];
  const campaigns  = data?.campaigns  ?? [];
  const agents     = data?.agents     ?? [];
  const totalCalls = data?.total_calls ?? 0;
  const maxCount   = Math.max(...outcomes.map((o) => o.count), 1);

  // Positive outcomes for mini summary
  const positive = outcomes
    .filter((o) => ['interested', 'order_confirmed', 'goal_achieved'].includes(o.outcome))
    .reduce((s, o) => s + o.count, 0);
  const convRate = totalCalls > 0 ? ((positive / totalCalls) * 100).toFixed(1) : '0.0';

  return (
    <GCard glow="#7C6EFA" style={{ padding: 0 }}>
      {/* Header */}
      <div style={{
        padding: '22px 26px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'linear-gradient(135deg, rgba(124,110,250,0.06) 0%, transparent 60%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -20, width: 180, height: 180,
          background: 'radial-gradient(circle, rgba(124,110,250,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
              Campaign Outcomes
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Per-campaign breakdown by outcome</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {totalCalls > 0 && (
              <>
                <div style={{
                  padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                  background: 'rgba(0,208,130,0.10)', border: '1px solid rgba(0,208,130,0.22)',
                  color: '#00D082', fontFamily: 'var(--font-mono)',
                }}>
                  {convRate}% conv
                </div>
                <div style={{
                  padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                }}>
                  {totalCalls.toLocaleString()} calls
                </div>
              </>
            )}
          </div>
        </div>

        {/* Selectors */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <StyledSelect value={selectedAgent} onChange={setSelectedAgent} placeholder="All Agents">
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </StyledSelect>
          <StyledSelect value={selectedCampaign} onChange={setSelectedCampaign} placeholder="All Campaigns">
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </StyledSelect>
        </div>
      </div>

      {/* Outcome rows */}
      <div style={{ padding: '16px 26px 20px' }}>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                <Sk h={11} w={100} />
                <Sk h={11} w={40} />
              </div>
              <Sk h={4} r={9999} />
            </div>
          ))
        ) : outcomes.length === 0 ? (
          <div style={{
            padding: '32px 0', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            No campaign calls recorded yet
          </div>
        ) : (
          outcomes.map((o, idx) => {
            const color = outcomeColor(o.outcome);
            const label = outcomeLabel(o.outcome);
            const icon  = outcomeIcon(o.outcome);
            const pct   = (o.count / maxCount) * 100;
            const pctOfTotal = totalCalls > 0 ? ((o.count / totalCalls) * 100).toFixed(1) : '0';

            return (
              <OutcomeRow
                key={o.outcome}
                icon={icon}
                label={label}
                color={color}
                count={o.count}
                pct={pct}
                pctOfTotal={pctOfTotal}
                delay={idx * 50}
              />
            );
          })
        )}
      </div>
    </GCard>
  );
}

function OutcomeRow({ icon, label, color, count, pct, pctOfTotal, delay }: {
  icon: string; label: string; color: string;
  count: number; pct: number; pctOfTotal: string; delay: number;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        marginBottom: 11,
        opacity: 1,
        animation: `fade-in 0.4s ${delay}ms both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, color: hov ? color : `${color}99`,
            transition: 'color 0.15s', lineHeight: 1,
          }}>
            {icon}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: hov ? 'var(--text-primary)' : 'var(--text-secondary)',
            transition: 'color 0.15s',
            letterSpacing: '0.01em',
          }}>
            {label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 12.5, fontFamily: 'var(--font-mono)', fontWeight: 700,
            color: hov ? color : 'var(--text-primary)',
            transition: 'color 0.15s',
          }}>
            {count.toLocaleString()}
          </span>
          <span style={{
            fontSize: 10.5, fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)', minWidth: 38, textAlign: 'right',
          }}>
            {pctOfTotal}%
          </span>
        </div>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: hov
            ? `linear-gradient(90deg, ${color}, ${color}cc)`
            : `linear-gradient(90deg, ${color}80, ${color}44)`,
          borderRadius: 9999,
          boxShadow: hov ? `0 0 10px ${color}50` : 'none',
          transition: 'all 0.25s ease-out',
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
    l: outcomeLabel(o.outcome).slice(0, 7),
    v: o.count,
    c: outcomeColor(o.outcome),
  }));

  const funnelItems = [
    { label: 'Total Calls',    value: overview?.total_calls       ?? 0, color: '#38BDF8' },
    { label: 'Connected',      value: overview?.completed_calls   ?? 0, color: '#00C2B8' },
    { label: 'Interested',     value: overview?.interested_outcomes ?? 0, color: '#00D082' },
    { label: 'Qualified Leads',value: overview?.qualified_leads   ?? 0, color: '#F0B429' },
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
          }}>Analytics</h1>
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
                <div key={i} style={{ flex: 1, height: `${30 + Math.random() * 70}%`, borderRadius: '3px 3px 0 0', background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          ) : callsBarData.length === 0 ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No data yet
            </div>
          ) : (
            <BarChart data={callsBarData} height={120} />
          )}
        </GCard>

        {/* Outcome distribution */}
        <GCard style={{ padding: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Call Outcomes</div>
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
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 20 }}>
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

        {/* Per-agent performance table */}
        <GCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 14px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Agent Performance</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Per-agent outcome breakdown</div>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 60px 80px 80px 80px 70px 90px 75px',
            padding: '8px 24px',
            background: 'rgba(255,255,255,0.025)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            gap: 4,
          }}>
            {['Agent','Calls','Interested','Confirmed','No Interest','Voicemail','Sentiment','Conv %'].map((h) => (
              <div key={h} style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)',
              }}>{h}</div>
            ))}
          </div>

          {/* Table rows */}
          {amLoad ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 60px 80px 80px 80px 70px 90px 75px',
                padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 4,
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
              const sc = sentimentColor(a.avg_sentiment);
              return (
                <div
                  key={a.agent_id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.4fr 60px 80px 80px 80px 70px 90px 75px',
                    padding: '11px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    animation: `fade-in 0.4s ${idx * 60}ms both`, gap: 4,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: sentimentColor(a.avg_sentiment),
                      boxShadow: `0 0 6px ${sentimentColor(a.avg_sentiment)}80`,
                    }} />
                    {a.agent_name ?? `Agent ${a.agent_id.slice(0, 6)}`}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {a.total_calls ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#00D082' }}>
                    {a.interested_count ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#00C2B8' }}>
                    {a.order_confirmed_count ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#FF4D6D' }}>
                    {a.not_interested_count ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#A89AF9' }}>
                    {a.voicemail_count ?? 0}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: sc }}>
                    {sentimentLabel(a.avg_sentiment)}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#00C2B8', fontWeight: 700 }}>
                    {a.conversion_rate ?? 0}%
                  </div>
                </div>
              );
            })
          )}
        </GCard>
      </div>

      {/* Campaign Outcomes Card — full width */}
      <CampaignOutcomesCard />

    </div>
  );
}
