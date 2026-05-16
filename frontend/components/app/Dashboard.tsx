'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from './AppShell';
import { useAgents, useDeleteAgent, AGENTS_KEY } from '@/lib/hooks/useAgents';
import { useAnalyticsOverview } from '@/lib/hooks/useAnalytics';
import { useActiveCalls, useCalls } from '@/lib/hooks/useCalls';
import type { Agent, CallRecord } from '@/lib/api';
import { apiFetch } from '@/lib/api';
import { AgentBuilder } from './AgentBuilder';
import { TestCallPanel } from './TestCallPanel';
import { AgentPreviewDrawer } from './AgentPreviewDrawer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs: number) {
  if (!secs) return '—';
  const rounded = Math.round(secs);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtTimeAgo(iso?: string) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function agentStatus(agent: Agent, activeSids: string[]): 'live' | 'idle' | 'paused' {
  if (!agent.is_active) return 'paused';
  if (activeSids.includes(agent.id)) return 'live';
  return 'idle';
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
      backgroundSize: '800px 100%',
      animation: 'shimmer 1.8s infinite linear',
    }} />
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style, onClick }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 20,
        boxShadow: hov ? '0 8px 25px rgba(15,23,42,0.10), 0 3px 8px rgba(15,23,42,0.06)' : '0 1px 3px rgba(15,23,42,0.06)',
        transform: hov && onClick ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend, icon, accentColor = '#10B981', bgColor, delay = 0 }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; icon?: string; accentColor?: string; bgColor?: string; delay?: number;
}) {
  return (
    <div style={{ animation: `fade-in 0.45s ${delay}ms both` }}>
      <Card style={{ padding: '22px 24px', overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 80, height: 80,
          background: bgColor ?? `${accentColor}12`,
          borderRadius: '0 20px 0 80px',
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#94A3B8',
          }}>
            {label}
          </div>
          {icon && (
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: `${accentColor}15`, border: `1px solid ${accentColor}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon d={icon} size={14} color={accentColor} />
            </div>
          )}
        </div>
        <div style={{
          fontSize: 28, fontWeight: 700,
          fontFamily: 'var(--font-mono)', color: '#0F172A',
          lineHeight: 1, marginBottom: 8, letterSpacing: '-0.02em',
        }}>
          {value}
        </div>
        {sub && (
          <div style={{
            fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
            color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#64748B',
          }}>
            {trend === 'up' && <span style={{ fontSize: 11, fontWeight: 700 }}>↑</span>}
            {trend === 'down' && <span style={{ fontSize: 11, fontWeight: 700 }}>↓</span>}
            {sub}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Outcome badge ────────────────────────────────────────────────────────────
const outcomeMeta: Record<string, { color: string; bg: string; border: string }> = {
  interested:          { color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  callback_scheduled:  { color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
  not_interested:      { color: '#EF4444', bg: '#FFF1F2', border: '#FECDD3' },
  voicemail_left:      { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  wrong_number:        { color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0' },
  do_not_call:         { color: '#EF4444', bg: '#FFF1F2', border: '#FECDD3' },
  completed:           { color: '#06B6D4', bg: '#ECFEFF', border: '#A5F3FC' },
  no_answer:           { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  busy:                { color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
};

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return <span style={{ color: '#94A3B8', fontSize: 11 }}>—</span>;
  const m = outcomeMeta[outcome] ?? { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' };
  const label = outcome.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
export function DashboardView({ onNewAgent, onNav }: {
  onNewAgent: () => void; onNav: (v: string) => void;
}) {
  const [hour] = useState(new Date().getHours());
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const { data: overview, isLoading: ovLoading } = useAnalyticsOverview();
  const { data: activeCalls } = useActiveCalls();
  const { data: callsData, isLoading: callsLoading } = useCalls(1);
  const { data: agentsData } = useAgents();

  const activeCount = (activeCalls as unknown as any[])?.length ?? 0;
  const agentList = agentsData?.items ?? [];
  const recentCalls = (callsData?.items ?? []).slice(0, 6);

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', animation: 'fade-in 0.4s both', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
            color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 5, lineHeight: 1.1,
          }}>
            {greeting}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 13, color: '#64748B' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            {activeCount > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: 9999,
                background: '#ECFDF5', border: '1px solid #A7F3D0',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#10B981',
                  display: 'inline-block', position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: '#10B981', animation: 'live-ring 1.5s ease-out infinite',
                  }} />
                </span>
                <span style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>
                  {activeCount} live {activeCount === 1 ? 'call' : 'calls'}
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onNewAgent}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12,
            background: '#0F172A', color: '#FFFFFF',
            border: 'none', fontSize: 13.5, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '-0.01em',
            boxShadow: '0 4px 12px rgba(15,23,42,0.20)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1E293B'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0F172A'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Create Agent
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {ovLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} style={{ padding: '22px 24px', height: 110 }}>
              <Skeleton h={10} w="55%" /><div style={{ marginTop: 14 }} /><Skeleton h={28} w="65%" />
            </Card>
          ))
        ) : (
          <>
            <StatCard label="Total Calls" value={overview?.total_calls?.toLocaleString() ?? '0'}
              sub={`${overview?.completed_calls ?? 0} completed`} trend="up"
              icon="M3 18v-6a9 9 0 0 1 18 0v6" accentColor="#10B981" bgColor="#ECFDF5" delay={0} />
            <StatCard label="Active Agents" value={`${agentList.filter(a=>a.is_active).length}`}
              sub={`of ${agentList.length} configured`}
              icon="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" accentColor="#3B82F6" bgColor="#EFF6FF" delay={60} />
            <StatCard label="Avg Duration" value={fmtDuration(overview?.avg_call_duration_seconds ?? 0)}
              icon="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM12 6v6l4 2" accentColor="#F59E0B" bgColor="#FFFBEB" delay={120} />
            <StatCard label="Conversion" value={`${overview?.conversion_rate ?? 0}%`}
              sub={`${overview?.interested_outcomes ?? 0} qualified leads`} trend="up"
              icon="M22 11.08V12a10 10 0 1 1-5.93-9.14" accentColor="#8B5CF6" bgColor="#F5F3FF" delay={180} />
          </>
        )}
      </div>

      {/* Main two-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Recent calls */}
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>Recent Calls</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Last 6 calls across all agents</div>
            </div>
            <button
              onClick={() => onNav('calls')}
              style={{
                background: '#F8FAFC', border: '1px solid #E2E8F0',
                borderRadius: 9, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                color: '#334155', cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
            >
              View all <span style={{ fontSize: 14 }}>→</span>
            </button>
          </div>

          {callsLoading ? (
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Skeleton w={36} h={36} r={9999} />
                  <div style={{ flex: 1 }}><Skeleton h={10} w="60%" /><div style={{ marginTop: 6 }} /><Skeleton h={8} w="40%" /></div>
                  <Skeleton w={60} h={18} r={9999} />
                </div>
              ))}
            </div>
          ) : recentCalls.length === 0 ? (
            <div style={{ padding: '50px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              No calls yet — test an agent to see data here.
            </div>
          ) : (
            <div>
              {recentCalls.map((call, idx) => (
                <RecentCallRow key={call.id} call={call} idx={idx} total={recentCalls.length} />
              ))}
            </div>
          )}
        </Card>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quick Actions */}
          <Card style={{ padding: '20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 14 }}>
              Quick Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <QuickBtn
                icon="M12 5v14M5 12h14"
                label="New Agent"
                onClick={onNewAgent}
                accent="#10B981" bg="#ECFDF5" />
              <QuickBtn
                icon="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                label="View Call Logs"
                onClick={() => onNav('calls')}
                accent="#3B82F6" bg="#EFF6FF" />
              <QuickBtn
                icon="M18 20V10M12 20V4M6 20v-6"
                label="Analytics"
                onClick={() => onNav('analytics')}
                accent="#8B5CF6" bg="#F5F3FF" />
            </div>
          </Card>

          {/* Agent snapshot */}
          <Card style={{ padding: '20px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>
                Agents
              </div>
              <button onClick={() => onNav('agents')} style={{
                background: 'none', border: 'none', fontSize: 12, color: '#3B82F6', cursor: 'pointer', fontWeight: 600,
              }}>
                View all →
              </button>
            </div>
            {agentList.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No agents configured</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agentList.slice(0, 4).map((agent) => {
                  const st = agentStatus(agent, []);
                  const stColor = st === 'live' ? '#10B981' : st === 'idle' ? '#3B82F6' : '#F59E0B';
                  const stBg = st === 'live' ? '#ECFDF5' : st === 'idle' ? '#EFF6FF' : '#FFFBEB';
                  return (
                    <div key={agent.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 12,
                      background: '#F8FAFC',
                      border: '1px solid #F1F5F9',
                    }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%', background: stColor, flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {agent.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>{agent.call_type}</div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                        background: stBg, color: stColor,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {st}
                      </span>
                    </div>
                  );
                })}
                {agentList.length > 4 && (
                  <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', paddingTop: 4 }}>
                    +{agentList.length - 4} more
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function RecentCallRow({ call, idx, total }: { call: CallRecord; idx: number; total: number }) {
  const [hov, setHov] = useState(false);
  const isOut = call.direction === 'outbound';
  const contact = isOut ? call.to_number : call.from_number;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto auto auto',
        gap: 16, alignItems: 'center',
        padding: '12px 24px',
        background: hov ? '#F8FAFC' : 'transparent',
        borderBottom: idx < total - 1 ? '1px solid #F1F5F9' : 'none',
        transition: 'background 0.15s',
        cursor: 'default',
        animation: `fade-in 0.4s ${idx * 50}ms both`,
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', fontFamily: 'var(--font-mono)' }}>
          {contact ?? '—'}
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
          {call.agent_name ?? 'Unknown agent'}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#94A3B8', whiteSpace: 'nowrap' }}>
        {fmtTimeAgo(call.started_at)}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999,
        background: isOut ? '#EFF6FF' : '#ECFDF5',
        color: isOut ? '#3B82F6' : '#10B981',
        border: `1px solid ${isOut ? '#BFDBFE' : '#A7F3D0'}`,
      }}>
        {isOut ? 'OUT' : 'IN'}
      </span>
      <OutcomeBadge outcome={call.outcome} />
      <div style={{ fontSize: 11.5, color: '#94A3B8', fontFamily: 'var(--font-mono)', textAlign: 'right', minWidth: 42 }}>
        {call.duration_seconds ? `${Math.floor(call.duration_seconds/60)}:${String(call.duration_seconds%60).padStart(2,'0')}` : '—'}
      </div>
    </div>
  );
}

function QuickBtn({ icon, label, onClick, accent, bg }: {
  icon: string; label: string; onClick: () => void; accent: string; bg: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 12, border: '1px solid transparent',
        background: hov ? bg : '#F8FAFC',
        borderColor: hov ? `${accent}30` : '#F1F5F9',
        color: hov ? accent : '#334155',
        cursor: 'pointer', transition: 'all 0.15s',
        fontSize: 13, fontWeight: 600, width: '100%', textAlign: 'left',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: hov ? `${accent}18` : '#F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        <Icon d={icon} size={13} color={hov ? accent : '#94A3B8'} />
      </div>
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS VIEW
// ═══════════════════════════════════════════════════════════════════════════════

export function AgentsView({ onSelectAgent, onNewAgent }: {
  onSelectAgent: (agent: Agent) => void;
  onNewAgent: () => void;
}) {
  const { data, isLoading } = useAgents();
  const { data: activeCalls } = useActiveCalls();
  const deleteAgent = useDeleteAgent();
  const queryClient = useQueryClient();

  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [pauseTarget, setPauseTarget] = useState<{ agent: Agent; action: 'pause' | 'resume' } | null>(null);
  const [toggling, setToggling] = useState(false);

  const [testTarget, setTestTarget]       = useState<Agent | null>(null);
  const [previewTarget, setPreviewTarget] = useState<Agent | null>(null);

  const agentList = data?.items ?? [];
  const activeAgentIds = ((activeCalls as unknown as any[]) ?? []).map((c: any) => c.agent_id);
  const liveCount = agentList.filter((a) => activeAgentIds.includes(a.id)).length;

  async function confirmDelete() {
    if (!deleteTarget || deleteInput !== deleteTarget.name) return;
    setDeleting(true);
    try {
      await deleteAgent.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteInput('');
    } finally {
      setDeleting(false);
    }
  }

  async function confirmToggle() {
    if (!pauseTarget) return;
    setToggling(true);
    try {
      await apiFetch(`/api/v1/agents/${pauseTarget.agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: pauseTarget.action === 'resume' }),
      });
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] });
      setPauseTarget(null);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', animation: 'fade-in 0.4s both', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
            color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 5,
          }}>
            Voice Agents
          </h1>
          <div style={{ fontSize: 13, color: '#64748B', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>{agentList.length} agents configured</span>
            {liveCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#10B981',
                  display: 'inline-block',
                }} />
                <span style={{ color: '#10B981', fontWeight: 600 }}>{liveCount} live</span>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onNewAgent}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12,
            background: '#0F172A', color: '#FFFFFF',
            border: 'none', fontSize: 13.5, fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(15,23,42,0.20)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1E293B'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0F172A'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Create Agent
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} style={{ padding: 24, height: 200 }}>
              <Skeleton h={12} w="50%" /><div style={{ marginTop: 12 }} />
              <Skeleton h={24} w="75%" /><div style={{ marginTop: 12 }} />
              <Skeleton h={10} w="40%" />
            </Card>
          ))}
        </div>
      ) : agentList.length === 0 ? (
        <Card style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18, background: '#F1F5F9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28,
          }}>
            🤖
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>No agents yet</div>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>Create your first voice agent to start making calls.</div>
          <button onClick={onNewAgent} style={{
            background: '#0F172A', borderRadius: 10, padding: '10px 24px',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
          }}>
            + Create Agent
          </button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {agentList.map((agent, idx) => {
            const st = agentStatus(agent, activeAgentIds);
            return (
              <AgentCard
                key={agent.id} agent={agent} status={st} idx={idx}
                onEdit={() => onSelectAgent(agent)}
                onTest={() => setTestTarget(agent)}
                onToggle={() => setPauseTarget({ agent, action: agent.is_active ? 'pause' : 'resume' })}
                onDelete={() => setDeleteTarget(agent)}
                onPreview={() => setPreviewTarget(agent)}
              />
            );
          })}
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <Modal onClose={() => { setDeleteTarget(null); setDeleteInput(''); }}>
          <div style={{ padding: '28px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: '#FFF1F2', border: '1px solid #FECDD3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Delete Agent</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>This action cannot be undone</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#334155', marginBottom: 18, lineHeight: 1.6 }}>
              Type <strong style={{ color: '#EF4444' }}>{deleteTarget.name}</strong> to confirm deletion.
            </p>
            <LightInput
              value={deleteInput} onChange={setDeleteInput}
              placeholder={deleteTarget.name} accent="#EF4444"
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setDeleteTarget(null); setDeleteInput(''); }} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleteInput !== deleteTarget.name || deleting}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10,
                  background: deleteInput === deleteTarget.name ? '#FFF1F2' : '#F8FAFC',
                  border: `1px solid ${deleteInput === deleteTarget.name ? '#FECDD3' : '#E2E8F0'}`,
                  color: deleteInput === deleteTarget.name ? '#EF4444' : '#94A3B8',
                  fontSize: 13, fontWeight: 600,
                  cursor: deleteInput === deleteTarget.name ? 'pointer' : 'not-allowed',
                  opacity: deleting ? 0.6 : 1, transition: 'all 0.2s',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete Agent'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pause/resume modal */}
      {pauseTarget && (
        <Modal onClose={() => setPauseTarget(null)}>
          <div style={{ padding: '28px 28px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
              {pauseTarget.action === 'pause' ? 'Pause Agent' : 'Enable Agent'}
            </div>
            <p style={{ fontSize: 13, color: '#334155', marginBottom: 24, lineHeight: 1.6 }}>
              {pauseTarget.action === 'pause'
                ? `Pausing "${pauseTarget.agent.name}" will stop it from accepting or making new calls.`
                : `Enabling "${pauseTarget.agent.name}" will allow it to make and receive calls again.`}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPauseTarget(null)} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={confirmToggle}
                disabled={toggling}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10,
                  background: pauseTarget.action === 'pause' ? '#FFFBEB' : '#ECFDF5',
                  border: `1px solid ${pauseTarget.action === 'pause' ? '#FDE68A' : '#A7F3D0'}`,
                  color: pauseTarget.action === 'pause' ? '#F59E0B' : '#10B981',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: toggling ? 0.6 : 1,
                }}
              >
                {toggling ? 'Updating…' : pauseTarget.action === 'pause' ? 'Yes, Pause' : 'Yes, Enable'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Test call panel */}
      {testTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)', zIndex: 999 }}>
          <button
            onClick={() => setTestTarget(null)}
            style={{
              position: 'fixed', top: 16, left: 20, zIndex: 1001,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px 7px 10px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 9,
              color: '#334155',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(15,23,42,0.10)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Agents
          </button>

          <TestCallPanel
            agentId={testTarget.id}
            agentName={testTarget.name}
            isSynced={Boolean(testTarget.elevenlabs_agent_id)}
            agentPhoneNumber={testTarget.twilio_phone_number}
          />
        </div>
      )}

      {/* Agent preview drawer */}
      {previewTarget && (
        <AgentPreviewDrawer
          agent={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onEdit={() => { setPreviewTarget(null); onSelectAgent(previewTarget); }}
        />
      )}
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────
const AGENT_ACCENTS = ['#F43F5E', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#06B6D4'];

function AgentCard({ agent, status, idx, onEdit, onTest, onToggle, onDelete, onPreview }: {
  agent: Agent; status: 'live' | 'idle' | 'paused'; idx: number;
  onEdit: () => void; onTest: () => void; onToggle: () => void; onDelete: () => void; onPreview: () => void;
}) {
  const [hov, setHov] = useState(false);
  const stColor = status === 'live' ? '#10B981' : status === 'idle' ? '#3B82F6' : '#F59E0B';
  const stBg = status === 'live' ? '#ECFDF5' : status === 'idle' ? '#EFF6FF' : '#FFFBEB';
  const stBorder = status === 'live' ? '#A7F3D0' : status === 'idle' ? '#BFDBFE' : '#FDE68A';
  const accent = AGENT_ACCENTS[idx % AGENT_ACCENTS.length];
  const accentBg = accent + '12';

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${hov ? '#E2E8F0' : '#E2E8F0'}`,
        borderRadius: 20, padding: 22, position: 'relative', overflow: 'hidden',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hov
          ? '0 12px 32px rgba(15,23,42,0.10), 0 4px 8px rgba(15,23,42,0.06)'
          : '0 1px 3px rgba(15,23,42,0.06)',
        transition: 'all 0.2s ease',
        animation: `fade-in 0.5s ${idx * 60}ms both`,
        cursor: 'default',
      }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent}, ${accent}60)`,
        borderRadius: '20px 20px 0 0',
      }} />

      {/* Corner decoration */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 100, height: 100,
        background: accentBg,
        borderRadius: '0 20px 0 100%',
        pointerEvents: 'none',
      }} />

      {/* Status row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: accentBg, border: `1px solid ${accent}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {[3, 6, 9, 6, 3].map((h, i) => (
                <div key={i} style={{
                  width: 2, height: h, background: accent, borderRadius: 1, opacity: 0.85,
                  animation: status === 'live' ? `bar-wave 1.4s ${i * 0.1}s ease-in-out infinite` : 'none',
                  transformOrigin: 'bottom',
                }} />
              ))}
            </div>
          </div>
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 9999,
            background: stBg, color: stColor, border: `1px solid ${stBorder}`,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {status}
          </span>
        </div>
        {!agent.is_active && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
            background: '#F8FAFC', color: '#94A3B8', border: '1px solid #E2E8F0',
            textTransform: 'uppercase',
          }}>
            Disabled
          </span>
        )}
      </div>

      {/* Name & info */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0F172A', marginBottom: 4, letterSpacing: '-0.02em' }}>
          {agent.name}
        </div>
        <div style={{ fontSize: 12, color: '#64748B' }}>
          {agent.call_type} · {agent.language} {agent.company_name ? `· ${agent.company_name}` : ''}
        </div>
        {agent.description && (
          <div style={{
            fontSize: 12, color: '#94A3B8', marginTop: 6, lineHeight: 1.5,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {agent.description}
          </div>
        )}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <Tag label={agent.llm_model?.split('-')[0] ?? 'LLM'} color="#3B82F6" bg="#EFF6FF" border="#BFDBFE" />
        <Tag label={`${agent.enabled_tools?.length ?? 0} tools`} color="#06B6D4" bg="#ECFEFF" border="#A5F3FC" />
        {agent.elevenlabs_agent_id
          ? <Tag label="EL synced" color="#10B981" bg="#ECFDF5" border="#A7F3D0" />
          : <Tag label="Not synced" color="#F59E0B" bg="#FFFBEB" border="#FDE68A" />}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <AgentActionBtn label="Preview" onClick={onPreview} color="#8B5CF6" bg="#F5F3FF" />
        <AgentActionBtn label="Test"    onClick={onTest}   color="#3B82F6" bg="#EFF6FF" disabled={!agent.elevenlabs_agent_id} />
        <AgentActionBtn label="Edit"    onClick={onEdit}   color="#10B981" bg="#ECFDF5" />
        <AgentActionBtn
          label={agent.is_active ? 'Pause' : 'Enable'}
          onClick={onToggle} color={agent.is_active ? '#F59E0B' : '#10B981'}
          bg={agent.is_active ? '#FFFBEB' : '#ECFDF5'}
        />
        <AgentActionBtn label="Delete"  onClick={onDelete} color="#EF4444" bg="#FFF1F2" />
      </div>
    </div>
  );
}

function Tag({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 9999,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

function AgentActionBtn({ label, onClick, color, bg, disabled }: {
  label: string; onClick: () => void; color: string; bg: string; disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, padding: '7px 0', borderRadius: 8,
        background: hov ? bg : '#F8FAFC',
        border: `1px solid ${hov ? color + '30' : '#E2E8F0'}`,
        color: disabled ? '#CBD5E1' : hov ? color : '#64748B',
        fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ─── Shared: Modal ────────────────────────────────────────────────────────────
export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 999,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 20, minWidth: 400, maxWidth: 520,
        boxShadow: '0 20px 60px rgba(15,23,42,0.15), 0 8px 20px rgba(15,23,42,0.08)',
        animation: 'modal-in 0.22s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Shared: LightInput ───────────────────────────────────────────────────────
export function LightInput({ value, onChange, placeholder, accent = '#10B981', type = 'text', disabled }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; accent?: string; type?: string; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      autoComplete="off"
      style={{
        width: '100%', boxSizing: 'border-box',
        background: '#F8FAFC',
        border: `1px solid ${focused ? accent : '#E2E8F0'}`,
        borderRadius: 10, padding: '10px 14px',
        fontSize: 13, color: '#0F172A', outline: 'none',
        fontFamily: 'var(--font-mono)',
        boxShadow: focused ? `0 0 0 3px ${accent}20` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// Legacy alias kept for compatibility with other files that import GlassInput
export const GlassInput = LightInput;

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '10px 0', borderRadius: 10,
  background: '#F8FAFC', border: '1px solid #E2E8F0',
  color: '#64748B', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
