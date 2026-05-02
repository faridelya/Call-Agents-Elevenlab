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
  const m = Math.floor(secs / 60);
  const s = secs % 60;
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
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '800px 100%',
      animation: 'shimmer 1.8s infinite linear',
    }} />
  );
}

// ─── Glass card wrapper ───────────────────────────────────────────────────────
function GlassCard({ children, style, hoverGlow = true }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  hoverGlow?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'rgba(9,20,38,0.60)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: `1px solid ${hov && hoverGlow ? 'rgba(0,208,130,0.20)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16,
        position: 'relative', overflow: 'hidden',
        transition: 'border-color 0.25s, box-shadow 0.25s, transform 0.25s var(--ease-out)',
        transform: hov && hoverGlow ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov && hoverGlow
          ? '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,208,130,0.08), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        ...style,
      }}
    >
      {/* Subtle green corner glow */}
      {hov && hoverGlow && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 120, height: 120,
          background: 'radial-gradient(circle at 100% 0%, rgba(0,208,130,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}
      {children}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend, icon, accentColor = '#00D082', delay = 0 }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; icon?: string; accentColor?: string; delay?: number;
}) {
  return (
    <div style={{ animation: `fade-in 0.5s ${delay}ms both` }}>
      <GlassCard style={{ padding: '22px 24px' }}>
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 100, height: 100,
          background: `radial-gradient(circle at 100% 0%, ${accentColor}12 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
          }}>
            {label}
          </div>
          {icon && (
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: `${accentColor}14`, border: `1px solid ${accentColor}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon d={icon} size={13} color={accentColor} />
            </div>
          )}
        </div>
        <div style={{
          fontSize: 30, fontWeight: 700,
          fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
          lineHeight: 1, marginBottom: 8,
          textShadow: `0 0 20px ${accentColor}30`,
        }}>
          {value}
        </div>
        {sub && (
          <div style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
            color: trend === 'up' ? '#00D082' : trend === 'down' ? '#FF4D6D' : 'var(--text-muted)',
          }}>
            {trend === 'up' && <span style={{ fontSize: 10 }}>↑</span>}
            {trend === 'down' && <span style={{ fontSize: 10 }}>↓</span>}
            {sub}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Outcome badge ────────────────────────────────────────────────────────────
const outcomeColor: Record<string, string> = {
  interested: '#00D082',
  callback_scheduled: '#38BDF8',
  not_interested: '#FF4D6D',
  voicemail_left: '#3D607A',
  wrong_number: '#263A4A',
  do_not_call: '#FF4D6D',
  completed: '#00C2B8',
  no_answer: '#3D607A',
  busy: '#F0B429',
};

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;
  const c = outcomeColor[outcome] ?? '#3D607A';
  const label = outcome.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
      background: `${c}14`, color: c, border: `1px solid ${c}25`,
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
    <div style={{ padding: '32px 36px', minHeight: '100vh', animation: 'fade-in 0.4s both' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6,
        }}>
          {greeting} 👋
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          {activeCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#00D082',
                boxShadow: '0 0 8px rgba(0,208,130,0.8)', animation: 'glow-pulse 2s infinite',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: 12, color: '#00D082', fontWeight: 600 }}>
                {activeCount} live {activeCount === 1 ? 'call' : 'calls'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {ovLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <GlassCard key={i} style={{ padding: '22px 24px', height: 110 }}>
              <Skeleton h={10} w="55%" /><div style={{ marginTop: 14 }} /><Skeleton h={28} w="65%" />
            </GlassCard>
          ))
        ) : (
          <>
            <StatCard label="Total Calls" value={overview?.total_calls?.toLocaleString() ?? '0'}
              sub={`${overview?.completed_calls ?? 0} completed`} trend="up"
              icon="M3 18v-6a9 9 0 0 1 18 0v6" accentColor="#00D082" delay={0} />
            <StatCard label="Active Agents" value={`${agentList.filter(a=>a.is_active).length}`}
              sub={`of ${agentList.length} configured`}
              icon="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" accentColor="#38BDF8" delay={60} />
            <StatCard label="Avg Duration" value={fmtDuration(overview?.avg_call_duration_seconds ?? 0)}
              icon="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM12 6v6l4 2" accentColor="#00C2B8" delay={120} />
            <StatCard label="Conversion" value={`${overview?.conversion_rate ?? 0}%`}
              sub={`${overview?.interested_outcomes ?? 0} qualified leads`} trend="up"
              icon="M22 11.08V12a10 10 0 1 1-5.93-9.14" accentColor="#F0B429" delay={180} />
          </>
        )}
      </div>

      {/* Main two-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Recent calls */}
        <GlassCard style={{ padding: 0 }} hoverGlow={false}>
          <div style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Recent Calls</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Last 6 calls across all agents</div>
            </div>
            <button
              onClick={() => onNav('calls')}
              style={{
                background: 'rgba(0,208,130,0.08)', border: '1px solid rgba(0,208,130,0.18)',
                borderRadius: 8, padding: '5px 12px', fontSize: 11.5, fontWeight: 600,
                color: '#00D082', cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,208,130,0.15)';
                e.currentTarget.style.boxShadow = '0 0 12px rgba(0,208,130,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,208,130,0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              View all <span style={{ fontSize: 13 }}>→</span>
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
            <div style={{ padding: '50px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No calls yet — test an agent to see data here.
            </div>
          ) : (
            <div>
              {recentCalls.map((call, idx) => (
                <RecentCallRow key={call.id} call={call} idx={idx} />
              ))}
            </div>
          )}
        </GlassCard>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quick Actions */}
          <GlassCard style={{ padding: '20px' }} hoverGlow={false}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>
              Quick Actions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <QuickBtn icon="M12 5v14M5 12h14" label="New Agent" onClick={onNewAgent} accent="#00D082" />
              <QuickBtn icon="M13 2L3 14h9l-1 8 10-12h-9l1-8z" label="View Call Logs" onClick={() => onNav('calls')} accent="#38BDF8" />
              <QuickBtn icon="M18 20V10M12 20V4M6 20v-6" label="Analytics" onClick={() => onNav('analytics')} accent="#00C2B8" />
            </div>
          </GlassCard>

          {/* Agent snapshot */}
          <GlassCard style={{ padding: '20px', flex: 1 }} hoverGlow={false}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Agents
              </div>
              <button onClick={() => onNav('agents')} style={{
                background: 'none', border: 'none', fontSize: 11, color: '#00D082', cursor: 'pointer', fontWeight: 600,
              }}>
                View all →
              </button>
            </div>
            {agentList.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No agents configured</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agentList.slice(0, 4).map((agent) => {
                  const st = agentStatus(agent, []);
                  const stColor = st === 'live' ? '#00D082' : st === 'idle' ? '#38BDF8' : '#F0B429';
                  return (
                    <div key={agent.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 11px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%', background: stColor, flexShrink: 0,
                        boxShadow: st === 'live' ? `0 0 8px ${stColor}` : 'none',
                        animation: st === 'live' ? 'glow-pulse 2s infinite' : 'none',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {agent.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{agent.call_type}</div>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                        background: `${stColor}14`, color: stColor, border: `1px solid ${stColor}25`,
                        textTransform: 'uppercase',
                      }}>
                        {st}
                      </span>
                    </div>
                  );
                })}
                {agentList.length > 4 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', paddingTop: 4 }}>
                    +{agentList.length - 4} more
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function RecentCallRow({ call, idx }: { call: CallRecord; idx: number }) {
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
        background: hov ? 'rgba(0,208,130,0.04)' : 'transparent',
        borderBottom: idx < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none',
        transition: 'background 0.15s',
        cursor: 'default',
        animation: `fade-in 0.4s ${idx * 50}ms both`,
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {contact ?? '—'}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
          {call.agent_name ?? 'Unknown agent'}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {fmtTimeAgo(call.started_at)}
      </div>
      <span style={{
        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
        background: isOut ? 'rgba(56,189,248,0.10)' : 'rgba(0,208,130,0.10)',
        color: isOut ? '#38BDF8' : '#00D082',
        border: `1px solid ${isOut ? 'rgba(56,189,248,0.22)' : 'rgba(0,208,130,0.22)'}`,
      }}>
        {isOut ? 'OUT' : 'IN'}
      </span>
      <OutcomeBadge outcome={call.outcome} />
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'right', minWidth: 42 }}>
        {call.duration_seconds ? `${Math.floor(call.duration_seconds/60)}:${String(call.duration_seconds%60).padStart(2,'0')}` : '—'}
      </div>
    </div>
  );
}

function QuickBtn({ icon, label, onClick, accent }: {
  icon: string; label: string; onClick: () => void; accent: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10, border: 'none',
        background: hov ? `${accent}12` : 'rgba(255,255,255,0.03)',
        borderWidth: 1, borderStyle: 'solid',
        borderColor: hov ? `${accent}30` : 'rgba(255,255,255,0.07)',
        color: hov ? accent : 'var(--text-secondary)',
        cursor: 'pointer', transition: 'all 0.18s var(--ease-out)',
        fontSize: 13, fontWeight: 500, width: '100%', textAlign: 'left',
        boxShadow: hov ? `0 0 16px ${accent}15` : 'none',
      }}
    >
      <Icon d={icon} size={14} color={hov ? accent : 'var(--text-muted)'} />
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
    <div style={{ padding: '32px 36px', minHeight: '100vh', animation: 'fade-in 0.4s both' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            Voice Agents
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>{agentList.length} agents configured</span>
            {liveCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#00D082',
                  boxShadow: '0 0 6px rgba(0,208,130,0.8)', display: 'inline-block',
                  animation: 'glow-pulse 2s infinite',
                }} />
                <span style={{ color: '#00D082', fontWeight: 600 }}>{liveCount} live</span>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onNewAgent}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(0,208,130,0.20) 0%, rgba(0,194,184,0.12) 100%)',
            border: '1px solid rgba(0,208,130,0.35)',
            color: '#00D082', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 0 20px rgba(0,208,130,0.12)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 28px rgba(0,208,130,0.25)'; e.currentTarget.style.background = 'linear-gradient(135deg,rgba(0,208,130,0.28) 0%,rgba(0,194,184,0.18) 100%)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,208,130,0.12)'; e.currentTarget.style.background = 'linear-gradient(135deg,rgba(0,208,130,0.20) 0%,rgba(0,194,184,0.12) 100%)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Create Agent
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <GlassCard key={i} style={{ padding: 24, height: 200 }}>
              <Skeleton h={12} w="50%" /><div style={{ marginTop: 12 }} />
              <Skeleton h={24} w="75%" /><div style={{ marginTop: 12 }} />
              <Skeleton h={10} w="40%" />
            </GlassCard>
          ))}
        </div>
      ) : agentList.length === 0 ? (
        <GlassCard style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🤖</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No agents yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Create your first voice agent to start making calls.</div>
          <button onClick={onNewAgent} style={{
            background: 'linear-gradient(135deg, rgba(0,208,130,0.20) 0%, rgba(0,194,184,0.12) 100%)',
            border: '1px solid rgba(0,208,130,0.35)', borderRadius: 10,
            padding: '10px 24px', color: '#00D082', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            + Create Agent
          </button>
        </GlassCard>
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
                background: 'rgba(255,77,109,0.12)', border: '1px solid rgba(255,77,109,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4D6D" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Delete Agent</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>This action cannot be undone</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.6 }}>
              Type <strong style={{ color: '#FF4D6D' }}>{deleteTarget.name}</strong> to confirm deletion.
            </p>
            <GlassInput
              value={deleteInput} onChange={setDeleteInput}
              placeholder={deleteTarget.name} accent="#FF4D6D"
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setDeleteTarget(null); setDeleteInput(''); }} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleteInput !== deleteTarget.name || deleting}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10,
                  background: deleteInput === deleteTarget.name ? 'rgba(255,77,109,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${deleteInput === deleteTarget.name ? 'rgba(255,77,109,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  color: deleteInput === deleteTarget.name ? '#FF4D6D' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600, cursor: deleteInput === deleteTarget.name ? 'pointer' : 'not-allowed',
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
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              {pauseTarget.action === 'pause' ? 'Pause Agent' : 'Enable Agent'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
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
                  background: pauseTarget.action === 'pause' ? 'rgba(240,180,41,0.12)' : 'rgba(0,208,130,0.12)',
                  border: `1px solid ${pauseTarget.action === 'pause' ? 'rgba(240,180,41,0.30)' : 'rgba(0,208,130,0.30)'}`,
                  color: pauseTarget.action === 'pause' ? '#F0B429' : '#00D082',
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.85)', backdropFilter: 'blur(6px)', zIndex: 999 }}>
          {/* Back to Agents button — always visible in top-left */}
          <button
            onClick={() => setTestTarget(null)}
            style={{
              position: 'fixed', top: 16, left: 20, zIndex: 1001,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px 7px 10px',
              background: 'rgba(6,10,20,0.82)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 9,
              color: '#94A3B8',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-inter), sans-serif',
              letterSpacing: '0.01em',
              transition: 'all 0.15s',
              boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.26)';
              e.currentTarget.style.color = '#F1F5F9';
              e.currentTarget.style.background = 'rgba(10,16,32,0.92)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
              e.currentTarget.style.color = '#94A3B8';
              e.currentTarget.style.background = 'rgba(6,10,20,0.82)';
            }}
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
            onCallEnded={() => setTestTarget(null)}
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
function AgentCard({ agent, status, idx, onEdit, onTest, onToggle, onDelete, onPreview }: {
  agent: Agent; status: 'live' | 'idle' | 'paused'; idx: number;
  onEdit: () => void; onTest: () => void; onToggle: () => void; onDelete: () => void; onPreview: () => void;
}) {
  const [hov, setHov] = useState(false);
  const stColor = status === 'live' ? '#00D082' : status === 'idle' ? '#38BDF8' : '#F0B429';

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'rgba(9,20,38,0.65)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: `1px solid ${hov ? `${stColor}28` : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16, padding: 22, position: 'relative', overflow: 'hidden',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hov
          ? `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${stColor}12, inset 0 1px 0 rgba(255,255,255,0.06)`
          : '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'all 0.25s var(--ease-out)',
        animation: `fade-in 0.5s ${idx * 60}ms both`,
        cursor: 'default',
      }}
    >
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 140, height: 140,
        background: `radial-gradient(circle at 100% 0%, ${stColor}10 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Status orb */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${stColor}15`, border: `1px solid ${stColor}28`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: status === 'live' ? `0 0 16px ${stColor}30` : 'none',
          }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {[3, 6, 9, 6, 3].map((h, i) => (
                <div key={i} style={{
                  width: 2, height: h, background: stColor, borderRadius: 1,
                  animation: status === 'live' ? `bar-wave 1.4s ${i * 0.1}s ease-in-out infinite` : 'none',
                  transformOrigin: 'bottom',
                }} />
              ))}
            </div>
          </div>
          <div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
              background: `${stColor}14`, color: stColor, border: `1px solid ${stColor}28`,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {status}
            </span>
          </div>
        </div>
        {!agent.is_active && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)',
            textTransform: 'uppercase',
          }}>
            Disabled
          </span>
        )}
      </div>

      {/* Name & info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em' }}>
          {agent.name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          {agent.call_type} · {agent.language} {agent.company_name ? `· ${agent.company_name}` : ''}
        </div>
        {agent.description && (
          <div style={{
            fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {agent.description}
          </div>
        )}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
        <Tag label={agent.llm_model?.split('-')[0] ?? 'LLM'} color="#38BDF8" />
        <Tag label={`${agent.enabled_tools?.length ?? 0} tools`} color="#00C2B8" />
        {agent.elevenlabs_agent_id
          ? <Tag label="EL synced" color="#00D082" />
          : <Tag label="Not synced" color="#F0B429" />}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 7 }}>
        <AgentActionBtn label="Preview" onClick={onPreview} color="#A89AF9" />
        <AgentActionBtn label="Test"    onClick={onTest}   color="#38BDF8" disabled={!agent.elevenlabs_agent_id} />
        <AgentActionBtn label="Edit"    onClick={onEdit}   color="#00D082" />
        <AgentActionBtn
          label={agent.is_active ? 'Pause' : 'Enable'}
          onClick={onToggle} color={agent.is_active ? '#F0B429' : '#00D082'}
        />
        <AgentActionBtn label="Delete"  onClick={onDelete} color="#FF4D6D" />
      </div>
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 600, padding: '2px 7px', borderRadius: 9999,
      background: `${color}10`, color, border: `1px solid ${color}20`,
    }}>
      {label}
    </span>
  );
}

function AgentActionBtn({ label, onClick, color, disabled }: {
  label: string; onClick: () => void; color: string; disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, padding: '6px 0', borderRadius: 7,
        background: hov ? `${color}15` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hov ? `${color}35` : 'rgba(255,255,255,0.07)'}`,
        color: disabled ? 'var(--text-disabled)' : hov ? color : 'var(--text-muted)',
        fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s', opacity: disabled ? 0.4 : 1,
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
        position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.85)',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 999,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'rgba(9,18,34,0.95)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(0,208,130,0.14)',
        borderRadius: 18, minWidth: 400, maxWidth: 520,
        boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,208,130,0.06)',
        animation: 'modal-in 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Shared: GlassInput ───────────────────────────────────────────────────────
export function GlassInput({ value, onChange, placeholder, accent = '#00D082', type = 'text', disabled }: {
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
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${focused ? accent + '55' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 10, padding: '10px 14px',
        fontSize: 13, color: 'var(--text-primary)', outline: 'none',
        fontFamily: 'var(--font-mono)',
        boxShadow: focused ? `0 0 0 3px ${accent}18` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '10px 0', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
