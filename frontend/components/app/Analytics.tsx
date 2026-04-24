'use client';

import { useAnalyticsOverview, useCallsOverTime, useOutcomeDistribution, useAgentMetrics } from '@/lib/hooks/useAnalytics';

interface BarData { l: string; v: number; }

function BarChart({ data, color = '#7C6EFA', height = 80 }: { data: BarData[]; color?: string; height?: number }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', background: color, borderRadius: '3px 3px 0 0', height: `${(d.v / max) * height * 0.85}px`, opacity: 0.4 + 0.6 * (d.v / max), transition: 'height 0.4s' }} />
          <span style={{ fontSize: 9, color: '#334155', whiteSpace: 'nowrap' }}>{d.l}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: 'up' | 'down' }) {
  return (
    <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#F1F5F9', lineHeight: 1, marginBottom: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#475569' }}>{sub}</div>}
    </div>
  );
}

function Skeleton({ h = 16, w = '100%', r = 6 }: { h?: number; w?: string | number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'rgba(255,255,255,0.05)', animation: 'shimmer 1.5s infinite' }} />;
}

function fmtDuration(secs: number) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function AnalyticsView() {
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview();
  const { data: callsTime, isLoading: callsLoading }   = useCallsOverTime('day');
  const { data: outcomes,  isLoading: outcomesLoading } = useOutcomeDistribution();

  // Format calls-over-time into bar chart data (last 7 entries)
  const callsBarData: BarData[] = (callsTime?.data ?? []).slice(-7).map((d) => ({
    l: new Date(d.period).toLocaleDateString('en-US', { weekday: 'short' }),
    v: d.count,
  }));

  const outcomeBarData: BarData[] = (outcomes?.outcomes ?? []).slice(0, 6).map((o) => ({
    l: o.outcome.replace(/_/g, ' ').slice(0, 5),
    v: o.count,
  }));

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', marginBottom: 3 }}>Analytics</h1>
        <p style={{ fontSize: 12, color: '#475569' }}>All time · All agents</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {overviewLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px' }}>
              <Skeleton h={10} w="60%" /><div style={{ marginTop: 10 }} /><Skeleton h={30} w="70%" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Calls"        value={overview?.total_calls?.toLocaleString() ?? '0'} sub={`${overview?.completed_calls ?? 0} completed`} trend="up" />
            <StatCard label="Avg Duration"        value={fmtDuration(overview?.avg_call_duration_seconds ?? 0)} />
            <StatCard label="Conversion Rate"     value={`${overview?.conversion_rate ?? 0}%`} sub={`${overview?.interested_outcomes ?? 0} interested`} trend="up" />
            <StatCard label="Qualified Leads"     value={String(overview?.qualified_leads ?? 0)} sub={`of ${overview?.total_leads ?? 0} total leads`} trend="up" />
          </>
        )}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 4 }}>Calls over time</div>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 16 }}>Daily</div>
          {callsLoading ? (
            <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Skeleton h={100} />
            </div>
          ) : callsBarData.length === 0 ? (
            <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 12 }}>No data yet</div>
          ) : (
            <BarChart data={callsBarData} color="#7C6EFA" height={100} />
          )}
        </div>

        <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 4 }}>Call outcomes</div>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 16 }}>Distribution</div>
          {outcomesLoading ? (
            <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Skeleton h={100} />
            </div>
          ) : outcomeBarData.length === 0 ? (
            <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: 12 }}>No outcomes yet</div>
          ) : (
            <BarChart data={outcomeBarData} color="#22D3EE" height={100} />
          )}
        </div>
      </div>

      <style>{`@keyframes shimmer{0%,100%{opacity:0.5}50%{opacity:1}}`}</style>
    </div>
  );
}
