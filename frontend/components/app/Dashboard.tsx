'use client';

import { useState } from 'react';
import { Icon } from './AppShell';
import { useAgents } from '@/lib/hooks/useAgents';
import { useAnalyticsOverview } from '@/lib/hooks/useAnalytics';
import { useActiveCalls } from '@/lib/hooks/useCalls';
import type { Agent } from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs: number) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function agentStatus(agent: Agent, activeSids: string[]): 'live' | 'idle' | 'paused' {
  if (!agent.is_active) return 'paused';
  if (activeSids.includes(agent.id)) return 'live';
  return 'idle';
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: 'up' | 'down' }) {
  return (
    <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#F1F5F9', lineHeight: 1, marginBottom: 6 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#475569' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ w = '100%', h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: 'rgba(255,255,255,0.05)',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

const statusColors = { live: '#10B981', idle: '#475569', paused: '#F59E0B' };
const micPath = 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2';

function AgentCard({
  agent,
  status,
  onClick,
}: {
  agent: Agent;
  status: 'live' | 'idle' | 'paused';
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const c = statusColors[status];

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#0F1623',
        border: `1px solid ${hov ? 'rgba(124,110,250,0.3)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 12,
        padding: 18,
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: hov ? '0 0 20px rgba(124,110,250,0.1)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={micPath} size={16} color={c} />
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 9999, background: `${c}15`, border: `1px solid ${c}25`, fontSize: 10, fontWeight: 600, color: c }}>
          {status === 'live' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: c, animation: 'pulse 2s infinite' }} />}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', marginBottom: 3 }}>{agent.name}</div>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 14 }}>
        {agent.call_type.charAt(0).toUpperCase() + agent.call_type.slice(1)}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
        {(agent.enabled_tools ?? []).slice(0, 4).map((t) => (
          <span key={t} style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: '#64748B', border: '1px solid rgba(255,255,255,0.08)' }}>
            {t}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 11, color: '#475569' }}>
          Type<br />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#A89AF9' }}>{agent.call_type}</span>
        </div>
        <div style={{ fontSize: 11, color: '#475569' }}>
          Status<br />
          <span style={{ fontSize: 13, fontWeight: 600, color: c }}>{status}</span>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes shimmer{0%,100%{opacity:0.5}50%{opacity:1}}`}</style>
    </div>
  );
}

// ─── Dashboard view ───────────────────────────────────────────────────────────

export function DashboardView({
  onSelectAgent,
  onNewAgent,
}: {
  onSelectAgent: (a: Agent) => void;
  onNewAgent: () => void;
}) {
  const { data: agentsData, isLoading: agentsLoading } = useAgents();
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview();
  const { data: activeCalls = [] } = useActiveCalls();

  const agentList = agentsData?.items ?? [];
  const liveCount = activeCalls.length;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 24, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: '#475569' }}>
          {today} · {liveCount} agent{liveCount !== 1 ? 's' : ''} live
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {overviewLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px' }}>
              <Skeleton h={10} w="60%" /><div style={{ marginTop: 10 }} />
              <Skeleton h={32} w="80%" /><div style={{ marginTop: 8 }} />
              <Skeleton h={12} w="50%" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Calls" value={overview?.total_calls?.toLocaleString() ?? '0'} sub={`${overview?.interested_outcomes ?? 0} interested`} trend="up" />
            <StatCard label="Active Agents" value={String(liveCount)} sub={`of ${agentList.length} configured`} />
            <StatCard label="Avg Call Duration" value={fmtDuration(overview?.avg_call_duration_seconds ?? 0)} />
            <StatCard label="Conversion Rate" value={`${overview?.conversion_rate ?? 0}%`} sub={`${overview?.qualified_leads ?? 0} qualified leads`} trend="up" />
          </>
        )}
      </div>

      {/* Agents header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#F1F5F9' }}>Your Agents</h2>
        <button
          onClick={onNewAgent}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#7C6EFA', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-inter), sans-serif', fontWeight: 600, fontSize: 13, color: '#fff', padding: '7px 14px', borderRadius: 8 }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New Agent
        </button>
      </div>

      {/* Agent grid */}
      {agentsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, height: 180 }}>
              <Skeleton h={38} w={38} r={10} />
            </div>
          ))}
        </div>
      ) : agentList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎙️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>No agents yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Create your first AI voice agent to get started.</div>
          <button
            onClick={onNewAgent}
            style={{ background: '#7C6EFA', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-inter), sans-serif' }}
          >
            + New Agent
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {agentList.map((agent) => {
            const status = agentStatus(agent, activeCalls.map((c) => c.agent_id ?? ''));
            return <AgentCard key={agent.id} agent={agent} status={status} onClick={() => onSelectAgent(agent)} />;
          })}
        </div>
      )}
    </div>
  );
}
