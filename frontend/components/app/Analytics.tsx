'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  useAnalyticsOverview,
  useCallsOverTime,
  useOutcomeDistribution,
  useAgentMetrics,
  useCampaignOutcomes,
} from '@/lib/hooks/useAnalytics';
import { OUTCOME_META, getOutcomeColor, getOutcomeLabel, getOutcomeIcon } from '@/lib/outcomeUtils';

function outcomeColor(o: string)  { return getOutcomeColor(o); }
function outcomeLabel(o: string)  { return getOutcomeLabel(o); }
function outcomeIcon(o: string)   { return getOutcomeIcon(o); }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(secs: number) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
function sentimentColor(score?: number) {
  if (score == null) return '#94A3B8';
  if (score >= 0.65) return '#10B981';
  if (score <= 0.35) return '#EF4444';
  return '#64748B';
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
      background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
      backgroundSize: '800px 100%', animation: 'shimmer 1.8s infinite linear',
    }} />
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function GCard({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${hov ? (glow ? `${glow}40` : '#CBD5E1') : '#E2E8F0'}`,
        borderRadius: 20, overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov
          ? '0 8px 25px rgba(15,23,42,0.10), 0 3px 8px rgba(15,23,42,0.06)'
          : '0 1px 3px rgba(15,23,42,0.06)',
        transition: 'all 0.25s ease-out',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend, accent = '#10B981', delay = 0 }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; accent?: string; delay?: number;
}) {
  return (
    <GCard glow={accent} style={{ padding: '22px 24px', animation: `fade-in 0.5s ${delay}ms both`, position: 'relative' } as any}>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 110, height: 110,
        background: `radial-gradient(circle at 100% 0%, ${accent}10 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#94A3B8', marginBottom: 16,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: '#0F172A', lineHeight: 1, marginBottom: 8,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 11, color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#64748B',
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
        const c = d.c ?? '#10B981';
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
              boxShadow: active ? `0 0 12px ${c}30` : 'none',
              transition: 'all 0.2s ease-out', minHeight: 2,
            }} />
            <span style={{ fontSize: 9, color: active ? c : '#94A3B8', whiteSpace: 'nowrap', transition: 'color 0.15s' }}>
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
        <span style={{ fontSize: 12, color: hov ? color : '#334155', transition: 'color 0.15s' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: hov ? color : '#64748B', fontWeight: 600, transition: 'color 0.15s' }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 5, background: '#F1F5F9', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, ${color}99)`,
          borderRadius: 9999,
          boxShadow: hov ? `0 0 8px ${color}30` : 'none',
          transition: 'box-shadow 0.2s',
        }} />
      </div>
    </div>
  );
}

// ─── Styled Select ────────────────────────────────────────────────────────────
function SearchSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((o) => !o);
    setSearch('');
  };

  const select = (id: string) => { onChange(id); setOpen(false); setSearch(''); };
  const selected = options.find((o) => o.id === value);
  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  const panel = open && rect ? createPortal(
    <div ref={panelRef} style={{
      position: 'fixed',
      top: rect.bottom + 4, left: rect.left, width: rect.width,
      background: '#FFFFFF', border: '1px solid #E2E8F0',
      borderRadius: 10, zIndex: 9999, overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(15,23,42,0.15)',
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            width: '100%', background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 6, padding: '5px 10px',
            fontSize: 11.5, color: '#0F172A', outline: 'none',
            fontFamily: 'var(--font-ui)', boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        <div
          onClick={() => select('')}
          style={{
            padding: '8px 12px', fontSize: 12, cursor: 'pointer',
            color: !value ? '#10B981' : '#64748B',
            background: !value ? '#ECFDF5' : 'transparent',
          }}
          onMouseEnter={(e) => { if (value) e.currentTarget.style.background = '#F8FAFC'; }}
          onMouseLeave={(e) => { if (value) e.currentTarget.style.background = 'transparent'; }}
        >{placeholder ?? 'All'}</div>
        {filtered.map((o) => (
          <div
            key={o.id}
            onClick={() => select(o.id)}
            style={{
              padding: '8px 12px', fontSize: 12, cursor: 'pointer',
              color: value === o.id ? '#10B981' : '#334155',
              background: value === o.id ? '#ECFDF5' : 'transparent',
            }}
            onMouseEnter={(e) => { if (value !== o.id) e.currentTarget.style.background = '#F8FAFC'; }}
            onMouseLeave={(e) => { if (value !== o.id) e.currentTarget.style.background = 'transparent'; }}
          >{o.name}</div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 12, fontSize: 11.5, color: '#64748B', textAlign: 'center' }}>
            No results
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        style={{
          width: '100%', background: open ? '#ECFDF5' : '#F8FAFC',
          border: `1px solid ${open ? '#A7F3D0' : '#E2E8F0'}`,
          borderRadius: 9, padding: '7px 32px 7px 12px',
          fontSize: 12, color: selected ? '#0F172A' : '#64748B',
          cursor: 'pointer', outline: 'none', textAlign: 'left',
          fontFamily: 'var(--font-ui)', transition: 'all 0.15s', display: 'block',
        }}
      >
        {selected?.name ?? placeholder ?? 'Select…'}
      </button>
      <span style={{
        position: 'absolute', right: 10, top: '50%',
        transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
        color: '#64748B', fontSize: 10, pointerEvents: 'none',
        transition: 'transform 0.2s',
      }}>▾</span>
      {panel}
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
    <GCard glow="#8B5CF6" style={{ padding: 0 }}>
      {/* Header */}
      <div style={{
        padding: '22px 26px 18px',
        borderBottom: '1px solid #F1F5F9',
        background: 'linear-gradient(135deg, #F5F3FF 0%, #FFFFFF 60%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -20, width: 180, height: 180,
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>
              Campaign Outcomes
            </div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Per-campaign breakdown by outcome</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {totalCalls > 0 && (
              <>
                <div style={{
                  padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                  background: '#ECFDF5', border: '1px solid #A7F3D0',
                  color: '#10B981', fontFamily: 'var(--font-mono)',
                }}>
                  {convRate}% conv
                </div>
                <div style={{
                  padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                  background: '#F8FAFC', border: '1px solid #E2E8F0',
                  color: '#64748B', fontFamily: 'var(--font-mono)',
                }}>
                  {totalCalls.toLocaleString()} calls
                </div>
              </>
            )}
          </div>
        </div>

        {/* Selectors */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <SearchSelect
            value={selectedAgent}
            onChange={setSelectedAgent}
            placeholder="All Agents"
            options={agents.map((a) => ({ id: a.id, name: a.name }))}
          />
          <SearchSelect
            value={selectedCampaign}
            onChange={setSelectedCampaign}
            placeholder="All Campaigns"
            options={campaigns.map((c) => ({ id: c.id, name: c.name }))}
          />
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
            color: '#64748B', fontSize: 13,
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
            color: hov ? '#0F172A' : '#334155',
            transition: 'color 0.15s',
            letterSpacing: '0.01em',
          }}>
            {label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 12.5, fontFamily: 'var(--font-mono)', fontWeight: 700,
            color: hov ? color : '#0F172A',
            transition: 'color 0.15s',
          }}>
            {count.toLocaleString()}
          </span>
          <span style={{
            fontSize: 10.5, fontFamily: 'var(--font-mono)',
            color: '#64748B', minWidth: 38, textAlign: 'right',
          }}>
            {pctOfTotal}%
          </span>
        </div>
      </div>
      <div style={{ height: 4, background: '#F1F5F9', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: hov
            ? `linear-gradient(90deg, ${color}, ${color}cc)`
            : `linear-gradient(90deg, ${color}80, ${color}44)`,
          borderRadius: 9999,
          boxShadow: hov ? `0 0 10px ${color}30` : 'none',
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
    c: '#F43F5E',
  }));

  const outcomePairs = (outcomes?.outcomes ?? []).slice(0, 8).map((o: any) => ({
    l: outcomeLabel(o.outcome).slice(0, 7),
    v: o.count,
    c: outcomeColor(o.outcome),
  }));

  const funnelItems = [
    { label: 'Total Calls',    value: overview?.total_calls       ?? 0, color: '#3B82F6' },
    { label: 'Connected',      value: overview?.completed_calls   ?? 0, color: '#06B6D4' },
    { label: 'Interested',     value: overview?.interested_outcomes ?? 0, color: '#10B981' },
    { label: 'Qualified Leads',value: overview?.qualified_leads   ?? 0, color: '#F59E0B' },
  ];

  const agentList = agentMet?.agents ?? [];

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', background: '#F8FAFC', animation: 'fade-in 0.4s both' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 6 }}>
            Analytics
          </div>
          <h1 style={{
            fontSize: 26, fontWeight: 800,
            color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 6,
          }}>Performance Overview</h1>
          <p style={{ fontSize: 13, color: '#64748B' }}>All time · All agents</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['day', 'week'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '6px 14px', borderRadius: 8,
                background: range === r ? '#EFF6FF' : '#F8FAFC',
                border: `1px solid ${range === r ? '#BFDBFE' : '#E2E8F0'}`,
                color: range === r ? '#3B82F6' : '#64748B',
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
              sub={`${overview?.completed_calls ?? 0} completed`} trend="up" accent="#10B981" delay={0} />
            <StatCard label="Avg Duration" value={fmtDuration(overview?.avg_call_duration_seconds ?? 0)}
              accent="#3B82F6" delay={60} />
            <StatCard label="Conversion Rate" value={`${overview?.conversion_rate ?? 0}%`}
              sub={`${overview?.interested_outcomes ?? 0} interested`} trend="up" accent="#06B6D4" delay={120} />
            <StatCard label="Qualified Leads" value={String(overview?.qualified_leads ?? 0)}
              sub={`of ${overview?.total_leads ?? 0} total`} trend="up" accent="#F59E0B" delay={180} />
          </>
        )}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Calls over time */}
        <GCard style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
                Calls Over Time
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>
                {range === 'day' ? 'Last 14 days' : 'By week'}
              </div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 9999,
              background: '#ECFDF5', color: '#10B981', border: '1px solid #A7F3D0',
            }}>
              {callsBarData.reduce((s, d) => s + d.v, 0)} calls
            </div>
          </div>
          {ctLoad ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: `${30 + Math.random() * 70}%`, borderRadius: '3px 3px 0 0', background: '#0F172A' }} />
              ))}
            </div>
          ) : callsBarData.length === 0 ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 13 }}>
              No data yet
            </div>
          ) : (
            <BarChart data={callsBarData} height={120} />
          )}
        </GCard>

        {/* Outcome distribution */}
        <GCard style={{ padding: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Call Outcomes</div>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 18 }}>Distribution</div>
          {ouLoad ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: `${30 + Math.random() * 70}%`, background: '#F1F5F9', borderRadius: '3px 3px 0 0' }} />
              ))}
            </div>
          ) : outcomePairs.length === 0 ? (
            <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 13 }}>
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
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Lead Funnel</div>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 18 }}>New → Converted</div>
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
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>Agent Performance</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Per-agent outcome breakdown</div>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 52px 62px 70px 75px 68px 75px 80px 62px',
            padding: '8px 24px',
            background: '#F8FAFC',
            borderTop: '1px solid #F1F5F9',
            borderBottom: '1px solid #F1F5F9',
            gap: 4,
          }}>
            {['Agent','Calls','Talk %','Interested','Confirmed','Follow-up','No Interest','Voicemail','Conv %'].map((h) => (
              <div key={h} style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#94A3B8',
              }}>{h}</div>
            ))}
          </div>

          {/* Table rows */}
          {amLoad ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1.5fr 52px 62px 70px 75px 68px 75px 80px 62px',
                padding: '12px 24px', borderBottom: '1px solid #F1F5F9', gap: 4,
              }}>
                <Sk h={11} w="70%" />
                {Array.from({ length: 8 }).map((_, j) => <Sk key={j} h={11} w="50%" />)}
              </div>
            ))
          ) : agentList.length === 0 ? (
            <div style={{ padding: '30px 24px', color: '#64748B', fontSize: 12, textAlign: 'center' }}>
              No agent data yet
            </div>
          ) : (
            agentList.map((a: any, idx: number) => {
              const total = a.total_calls ?? 0;
              const vm = a.voicemail_count ?? 0;
              const talkRate = total > 0 ? Math.round(((total - vm) / total) * 100) : 0;
              const talkColor = talkRate >= 70 ? '#10B981' : talkRate >= 40 ? '#F59E0B' : '#EF4444';
              return (
                <div
                  key={a.agent_id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.5fr 52px 62px 70px 75px 68px 75px 80px 62px',
                    padding: '11px 24px', borderBottom: '1px solid #F1F5F9',
                    animation: `fade-in 0.4s ${idx * 60}ms both`, gap: 4,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: '#0F172A',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: sentimentColor(a.avg_sentiment),
                    }} />
                    {a.agent_name ?? `Agent ${a.agent_id.slice(0, 6)}`}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#0F172A' }}>
                    {total}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: talkColor, fontWeight: 700 }}>
                    {talkRate}%
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#10B981' }}>
                    {a.interested_count ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#06B6D4' }}>
                    {a.order_confirmed_count ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#8B5CF6' }}>
                    {a.connect_later_count ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#EF4444' }}>
                    {a.not_interested_count ?? 0}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#94A3B8' }}>
                    {vm}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#06B6D4', fontWeight: 700 }}>
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
