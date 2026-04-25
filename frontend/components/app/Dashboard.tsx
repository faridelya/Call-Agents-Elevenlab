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

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
    <div style={{ width: w, height: h, borderRadius: r, background: 'rgba(255,255,255,0.05)', animation: 'shimmer 1.5s infinite' }} />
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, trend, icon, accentColor = '#7C6EFA',
}: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; icon?: string; accentColor?: string;
}) {
  return (
    <div style={{
      background: '#0F1623',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '20px 22px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Accent corner glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 80, height: 80,
        background: `radial-gradient(circle at 100% 0%, ${accentColor}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#334155' }}>
          {label}
        </div>
        {icon && (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accentColor}14`, border: `1px solid ${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={icon} size={13} color={accentColor} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#F1F5F9', lineHeight: 1, marginBottom: 6 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
          {trend === 'up' && <span>↑</span>}
          {trend === 'down' && <span>↓</span>}
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Outcome badge ────────────────────────────────────────────────────────────

const outcomeColor: Record<string, string> = {
  interested: '#10B981', callback_scheduled: '#7C6EFA', not_interested: '#EF4444',
  voicemail_left: '#475569', wrong_number: '#334155', do_not_call: '#EF4444',
  completed: '#22D3EE',
};

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return <span style={{ fontSize: 11, color: '#334155' }}>—</span>;
  const c = outcomeColor[outcome] ?? '#475569';
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: `${c}13`, color: c, border: `1px solid ${c}20`, fontFamily: 'var(--font-inter)', whiteSpace: 'nowrap' }}>
      {outcome.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase())}
    </span>
  );
}

// ─── Recent call row ──────────────────────────────────────────────────────────

function RecentCallRow({ call }: { call: CallRecord }) {
  const contact = call.direction === 'inbound' ? call.from_number : call.to_number;
  const dirColor = call.direction === 'inbound' ? '#22D3EE' : '#A89AF9';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 70px 100px 70px',
      padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.035)',
      alignItems: 'center', transition: 'background 0.1s',
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#E2E8F0', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{contact ?? '—'}</div>
        {call.agent_name && <div style={{ fontSize: 10, color: '#334155', marginTop: 1 }}>{call.agent_name}</div>}
      </div>
      <div style={{ fontSize: 10, color: '#475569' }}>{fmtTimeAgo(call.created_at)}</div>
      <div>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 9999, background: `${dirColor}12`, color: dirColor, border: `1px solid ${dirColor}20`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {call.direction === 'inbound' ? 'In' : 'Out'}
        </span>
      </div>
      <OutcomeBadge outcome={call.outcome} />
      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-jetbrains-mono), monospace', textAlign: 'right' }}>
        {fmtDuration(call.duration_seconds ?? 0)}
      </div>
    </div>
  );
}

// ─── Quick action button ──────────────────────────────────────────────────────

function QuickAction({ icon, label, desc, color, onClick }: { icon: string; label: string; desc: string; color: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? `${color}10` : '#0F1623',
        border: `1px solid ${hov ? `${color}35` : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 12, padding: '14px 16px',
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        boxShadow: hov ? `0 0 20px ${color}12` : 'none',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}14`, border: `1px solid ${color}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: hov ? `0 0 14px ${color}30` : 'none',
        transition: 'box-shadow 0.18s',
      }}>
        <Icon d={icon} size={15} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', fontFamily: 'var(--font-inter)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-inter)' }}>{desc}</div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export function DashboardView({
  onNewAgent,
  onNav,
}: {
  onNewAgent: () => void;
  onNav: (v: string) => void;
}) {
  const { data: agentsData } = useAgents();
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview();
  const { data: activeCalls = [] } = useActiveCalls();
  const { data: recentCallsData, isLoading: callsLoading } = useCalls(1);

  const agentList = agentsData?.items ?? [];
  const liveCount = activeCalls.length;
  const recentCalls = recentCallsData?.items?.slice(0, 6) ?? [];
  const totalCalls = recentCallsData?.total ?? 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ padding: '28px 32px' }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:0.5}50%{opacity:1}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.03em', marginBottom: 5 }}>
          {greeting} 👋
        </h1>
        <p style={{ fontSize: 13, color: '#475569', fontFamily: 'var(--font-inter)' }}>
          {today} · {liveCount > 0 ? <span style={{ color: '#10B981' }}>{liveCount} agent{liveCount !== 1 ? 's' : ''} live</span> : `${agentList.length} agent${agentList.length !== 1 ? 's' : ''} configured`}
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {overviewLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
              <Skeleton h={10} w="55%" /><div style={{ marginTop: 14 }} /><Skeleton h={32} w="65%" /><div style={{ marginTop: 8 }} /><Skeleton h={10} w="45%" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Calls" value={overview?.total_calls?.toLocaleString() ?? '0'} sub={`${overview?.completed_calls ?? 0} completed`} trend="up" icon="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07" accentColor="#7C6EFA" />
            <StatCard label="Active Agents" value={String(liveCount)} sub={`of ${agentList.length} configured`} icon="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2" accentColor="#22D3EE" />
            <StatCard label="Avg Duration" value={fmtDuration(overview?.avg_call_duration_seconds ?? 0)} icon="M12 22s8-4 8-10V5" accentColor="#A89AF9" />
            <StatCard label="Conversion" value={`${overview?.conversion_rate ?? 0}%`} sub={`${overview?.qualified_leads ?? 0} qualified leads`} trend="up" icon="M18 20V10M12 20V4M6 20v-6" accentColor="#10B981" />
          </>
        )}
      </div>

      {/* Main content: recent calls + quick actions side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

        {/* Recent calls */}
        <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', fontFamily: 'var(--font-inter)' }}>Recent Calls</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{totalCalls.toLocaleString()} total</div>
            </div>
            <button
              onClick={() => onNav('calls')}
              style={{ fontSize: 11, fontWeight: 600, color: '#7C6EFA', background: 'transparent', border: '1px solid rgba(124,110,250,0.25)', borderRadius: 7, padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-inter)', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,110,250,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              View all →
            </button>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 70px 100px 70px', padding: '8px 18px', background: '#0C1120' }}>
            {['Contact', 'When', 'Dir', 'Outcome', 'Dur'].map((h) => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', fontFamily: 'var(--font-inter)' }}>{h}</span>
            ))}
          </div>

          {callsLoading ? (
            <div style={{ padding: '32px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={14} />)}
            </div>
          ) : recentCalls.length === 0 ? (
            <div style={{ padding: '48px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, opacity: 0.15, marginBottom: 8 }}>📞</div>
              <div style={{ fontSize: 13, color: '#475569', fontFamily: 'var(--font-inter)' }}>No calls yet</div>
              <div style={{ fontSize: 11, color: '#334155', marginTop: 4, fontFamily: 'var(--font-inter)' }}>Initiate a test call from an agent to get started.</div>
            </div>
          ) : (
            recentCalls.map((call) => <RecentCallRow key={call.id} call={call} />)
          )}
        </div>

        {/* Right column: quick actions + agent summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Quick actions */}
          <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#334155', marginBottom: 12, fontFamily: 'var(--font-inter)' }}>Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <QuickAction
                icon="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2"
                label="New Agent"
                desc="Create a voice agent"
                color="#7C6EFA"
                onClick={onNewAgent}
              />
              <QuickAction
                icon="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12"
                label="View Call Logs"
                desc="Full history + transcripts"
                color="#22D3EE"
                onClick={() => onNav('calls')}
              />
              <QuickAction
                icon="M18 20V10M12 20V4M6 20v-6"
                label="Analytics"
                desc="Performance & metrics"
                color="#10B981"
                onClick={() => onNav('analytics')}
              />
            </div>
          </div>

          {/* Agent snapshot */}
          <div style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#334155', marginBottom: 12, fontFamily: 'var(--font-inter)' }}>Agents</div>
            {agentList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 22, opacity: 0.2, marginBottom: 8 }}>🎙️</div>
                <div style={{ fontSize: 12, color: '#475569' }}>No agents yet</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agentList.slice(0, 4).map((agent) => {
                  const st = agentStatus(agent, activeCalls.map((c) => c.agent_id ?? ''));
                  const stColor = st === 'live' ? '#10B981' : st === 'paused' ? '#F59E0B' : '#334155';
                  return (
                    <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: stColor, boxShadow: st === 'live' ? `0 0 6px ${stColor}` : 'none', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-inter)' }}>{agent.name}</div>
                        <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-inter)' }}>{agent.call_type}</div>
                      </div>
                    </div>
                  );
                })}
                {agentList.length > 4 && (
                  <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', paddingTop: 4, fontFamily: 'var(--font-inter)' }}>+{agentList.length - 4} more</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AGENTS VIEW ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Modal backdrop ───────────────────────────────────────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,7,16,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      {children}
    </div>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteAgentModal({ agent, onClose, onDeleted }: { agent: Agent; onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const deleteAgent = useDeleteAgent();
  const matched = confirmText === agent.name;

  async function handleDelete() {
    if (!matched) return;
    await deleteAgent.mutateAsync(agent.id);
    onDeleted();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ background: '#0C1120', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 20, padding: '32px', width: '100%', maxWidth: 440, animation: 'modal-in 0.25s cubic-bezier(0.16,1,0.3,1) forwards', boxShadow: '0 32px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(239,68,68,0.08)' }}>
        <div style={{ width: 52, height: 52, borderRadius: 15, background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </div>
        <h3 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700, color: '#F1F5F9', marginBottom: 8 }}>Delete Agent</h3>
        <p style={{ fontSize: 13, color: '#64748B', fontFamily: 'var(--font-inter)', lineHeight: 1.65, marginBottom: 6 }}>
          This will permanently delete <strong style={{ color: '#CBD5E1' }}>{agent.name}</strong> and all associated data. This cannot be undone.
        </p>
        <p style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-inter)', marginBottom: 20 }}>
          Type <strong style={{ color: '#EF4444', fontFamily: 'var(--font-jetbrains-mono)' }}>{agent.name}</strong> to confirm deletion.
        </p>
        <input
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={agent.name}
          style={{ width: '100%', boxSizing: 'border-box', background: '#080B14', border: `1px solid ${matched ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#F1F5F9', fontFamily: 'var(--font-jetbrains-mono), monospace', outline: 'none', marginBottom: 18, transition: 'border-color 0.2s' }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'var(--font-inter)', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = '#94A3B8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#64748B'; }}
          >Cancel</button>
          <button onClick={handleDelete} disabled={!matched || deleteAgent.isPending} style={{ flex: 1, padding: '11px', background: matched ? 'rgba(239,68,68,0.13)' : 'rgba(255,255,255,0.02)', border: `1px solid ${matched ? 'rgba(239,68,68,0.38)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: matched ? '#EF4444' : '#2A3548', cursor: matched ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-inter)', transition: 'all 0.15s' }}>
            {deleteAgent.isPending ? 'Deleting…' : 'Delete Agent'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Toggle active confirmation modal ─────────────────────────────────────────

function ToggleAgentModal({ agent, onClose, onConfirm, isPending }: { agent: Agent; onClose: () => void; onConfirm: () => void; isPending: boolean }) {
  const willDisable = agent.is_active;
  const accentColor = willDisable ? '#F59E0B' : '#10B981';
  return (
    <ModalBackdrop onClose={onClose}>
      <div style={{ background: '#0C1120', border: `1px solid ${accentColor}25`, borderRadius: 20, padding: '32px', width: '100%', maxWidth: 420, animation: 'modal-in 0.25s cubic-bezier(0.16,1,0.3,1) forwards', boxShadow: '0 32px 100px rgba(0,0,0,0.55)' }}>
        <div style={{ width: 52, height: 52, borderRadius: 15, background: `${accentColor}12`, border: `1px solid ${accentColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          {willDisable
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.8" strokeLinecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.8" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </div>
        <h3 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700, color: '#F1F5F9', marginBottom: 8 }}>
          {willDisable ? 'Disable Agent?' : 'Enable Agent?'}
        </h3>
        <p style={{ fontSize: 13, color: '#64748B', fontFamily: 'var(--font-inter)', lineHeight: 1.65, marginBottom: 28 }}>
          {willDisable
            ? `Disabling "${agent.name}" will prevent it from starting new calls. Active calls already in progress will not be interrupted.`
            : `Re-enabling "${agent.name}" will allow it to make and receive calls again.`
          }
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'var(--font-inter)', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = '#94A3B8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#64748B'; }}
          >Cancel</button>
          <button onClick={onConfirm} disabled={isPending} style={{ flex: 1, padding: '11px', background: `${accentColor}12`, border: `1px solid ${accentColor}35`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: accentColor, cursor: 'pointer', fontFamily: 'var(--font-inter)', transition: 'all 0.15s' }}>
            {isPending ? 'Processing…' : willDisable ? 'Yes, Disable' : 'Yes, Enable'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Action button on agent card ──────────────────────────────────────────────

function CardAction({ icon, label, color, onClick, disabled = false, title }: {
  icon: React.ReactNode; label: string; color: string;
  onClick: (e: React.MouseEvent) => void; disabled?: boolean; title?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title ?? label}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 6px', borderRadius: 9, background: hov && !disabled ? `${color}12` : 'transparent', border: `1px solid ${hov && !disabled ? `${color}28` : 'rgba(255,255,255,0.05)'}`, color: disabled ? '#1E2A3D' : hov ? color : '#3A4A60', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-inter)', transition: 'all 0.14s', opacity: disabled ? 0.5 : 1 }}
    >
      {icon}
      <span style={{ color: 'inherit' }}>{label}</span>
    </button>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

const statusColors = { live: '#10B981', idle: '#475569', paused: '#F59E0B' };

const TIER1_TOOL_IDS = new Set(['save_lead', 'get_contact_info', 'end_call', 'log_call_outcome', 'get_call_script', 'update_call_stage']);

function AgentCard({ agent, status, onEdit, onTestCall, onDelete, onToggle }: {
  agent: Agent; status: 'live' | 'idle' | 'paused';
  onEdit: () => void; onTestCall: () => void; onDelete: () => void; onToggle: () => void;
}) {
  const [hov, setHov] = useState(false);
  const c = statusColors[status];
  const isSynced = !!agent.elevenlabs_agent_id && !!agent.el_last_synced_at;
  const tier2Count = (agent.enabled_tools ?? []).filter((t) => !TIER1_TOOL_IDS.has(t)).length;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: '#0F1623', border: `1px solid ${hov ? 'rgba(124,110,250,0.22)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 16, overflow: 'hidden', transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)', boxShadow: hov ? '0 8px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(124,110,250,0.06)' : 'none', position: 'relative' }}
    >
      {/* Gradient top accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${c}55, transparent)`, opacity: hov || status === 'live' ? 1 : 0, transition: 'opacity 0.2s' }} />

      <div style={{ padding: '20px 20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          {/* Orb */}
          <div style={{ position: 'relative', width: 48, height: 48 }}>
            <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: `radial-gradient(circle, ${c}18 0%, transparent 70%)`, animation: status === 'live' ? 'orb-pulse 2.5s ease-in-out infinite' : 'none' }} />
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${c}18 0%, ${c}06 100%)`, border: `1px solid ${c}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: hov ? `0 0 22px ${c}22` : 'none', transition: 'box-shadow 0.2s' }}>
              <div style={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
                {[5, 9, 15, 9, 5].map((h, i) => (
                  <div key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: status === 'live' ? `linear-gradient(to top, ${c}, ${c}80)` : c, opacity: status === 'idle' ? 0.28 : 0.9, animation: status === 'live' ? `wave-bar 0.7s ease-in-out ${i * 0.1}s infinite` : 'none' }} />
                ))}
              </div>
            </div>
          </div>
          {/* Status badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: `${c}12`, border: `1px solid ${c}22`, fontSize: 9, fontWeight: 800, color: c, fontFamily: 'var(--font-inter)', letterSpacing: '0.07em' }}>
            {status === 'live' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: c, animation: 'pulse-dot 2s ease-in-out infinite' }} />}
            {status.toUpperCase()}
          </div>
        </div>

        {/* Agent name */}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9', marginBottom: 3, fontFamily: 'var(--font-syne), sans-serif', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{agent.name}</div>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: agent.description ? 10 : 14, fontFamily: 'var(--font-inter)' }}>
          {agent.call_type ? agent.call_type.charAt(0).toUpperCase() + agent.call_type.slice(1) : '—'} · {agent.language?.toUpperCase() ?? 'EN'}
          {agent.company_name ? ` · ${agent.company_name}` : ''}
        </div>

        {agent.description && (
          <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.55, marginBottom: 14, fontFamily: 'var(--font-inter)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {agent.description}
          </div>
        )}

        {/* Tags */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, marginBottom: 16 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'rgba(124,110,250,0.08)', color: '#7C6EFA', border: '1px solid rgba(124,110,250,0.14)', fontFamily: 'var(--font-inter)', letterSpacing: '0.04em' }}>
            {agent.llm_model?.split('-')?.[0]?.toUpperCase() ?? 'AI'}
          </span>
          {tier2Count > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'rgba(34,211,238,0.07)', color: '#22D3EE', border: '1px solid rgba(34,211,238,0.13)', fontFamily: 'var(--font-inter)', letterSpacing: '0.04em' }}>
              +{tier2Count} Tool{tier2Count !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: isSynced ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)', color: isSynced ? '#10B981' : '#F59E0B', border: `1px solid ${isSynced ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)'}`, fontFamily: 'var(--font-inter)', letterSpacing: '0.04em' }}>
            {isSynced ? 'EL Synced' : 'Not Synced'}
          </span>
          {!agent.is_active && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.07)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.14)', fontFamily: 'var(--font-inter)', letterSpacing: '0.04em' }}>Disabled</span>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px', display: 'flex', gap: 5 }}>
        <CardAction
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>}
          label="Test" color="#10B981"
          onClick={(e) => { e.stopPropagation(); onTestCall(); }}
          disabled={!isSynced} title={isSynced ? 'Test Call' : 'Sync to ElevenLabs first'}
        />
        <CardAction
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
          label="Edit" color="#7C6EFA"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        />
        <CardAction
          icon={agent.is_active
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
          label={agent.is_active ? 'Pause' : 'Resume'} color="#F59E0B"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        />
        <CardAction
          icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>}
          label="Delete" color="#EF4444"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        />
      </div>

      <style>{`
        @keyframes orb-pulse { 0%,100%{transform:scale(1);opacity:0.45} 50%{transform:scale(1.12);opacity:0.8} }
        @keyframes wave-bar  { 0%,100%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}

// ─── Agents view ──────────────────────────────────────────────────────────────

export function AgentsView({
  onSelectAgent: _onSelectAgent,
  onNewAgent: _onNewAgent,
}: {
  onSelectAgent: (a: Agent) => void;
  onNewAgent: () => void;
}) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);
  const [testCallAgent, setTestCallAgent] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [disableTarget, setDisableTarget] = useState<Agent | null>(null);

  const { data: agentsData, isLoading } = useAgents();
  const { data: activeCalls = [] } = useActiveCalls();
  const qc = useQueryClient();

  const disableMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<Agent>(`/api/v1/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });

  const agentList = agentsData?.items ?? [];
  const liveCount = activeCalls.length;

  // Prevent body scroll when modal is open
  useEffect(() => {
    const open = builderOpen || !!testCallAgent || !!deleteTarget || !!disableTarget;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [builderOpen, testCallAgent, deleteTarget, disableTarget]);

  function openCreate() { setEditAgentId(null); setBuilderOpen(true); }
  function openEdit(agent: Agent) { setEditAgentId(agent.id); setBuilderOpen(true); }
  function closeBuilder() { setBuilderOpen(false); setEditAgentId(null); }

  return (
    <div style={{ padding: '28px 32px' }}>
      <style>{`
        @keyframes shimmer  { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes modal-in { from{opacity:0;transform:scale(0.96) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes card-in  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 24, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.03em', marginBottom: 5 }}>
            Voice Agents
          </h1>
          <p style={{ fontSize: 13, color: '#475569', fontFamily: 'var(--font-inter)' }}>
            {agentList.length} configured · {liveCount > 0 ? <span style={{ color: '#10B981' }}>{liveCount} live</span> : 'none active'}
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #7C6EFA 0%, #6B5FE8 100%)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: 13, color: '#fff', padding: '10px 20px', borderRadius: 11, boxShadow: '0 0 24px rgba(124,110,250,0.35), 0 4px 14px rgba(0,0,0,0.2)', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 40px rgba(124,110,250,0.55), 0 4px 18px rgba(0,0,0,0.25)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 24px rgba(124,110,250,0.35), 0 4px 14px rgba(0,0,0,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Agent
        </button>
      </div>

      {/* Agent grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#0F1623', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20, height: 230 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <Skeleton h={48} w={48} r={14} />
                <div style={{ flex: 1 }}><Skeleton h={14} w="60%" /><div style={{ marginTop: 8 }}/><Skeleton h={10} w="40%" /></div>
              </div>
              <Skeleton h={10} w="80%" /><div style={{ marginTop: 8 }}/><Skeleton h={10} w="55%" />
            </div>
          ))}
        </div>
      ) : agentList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(124,110,250,0.07)', border: '1px solid rgba(124,110,250,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', boxShadow: '0 0 48px rgba(124,110,250,0.08)' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#7C6EFA" strokeWidth="1.4" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#475569', marginBottom: 8, fontFamily: 'var(--font-syne)' }}>No agents yet</div>
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 28, fontFamily: 'var(--font-inter)' }}>Create your first AI voice agent to start making calls.</div>
          <button onClick={openCreate} style={{ background: 'linear-gradient(135deg, #7C6EFA, #6B5FE8)', border: 'none', borderRadius: 11, padding: '11px 28px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-inter)', boxShadow: '0 0 24px rgba(124,110,250,0.35)' }}>
            + Create Your First Agent
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {agentList.map((agent, idx) => {
            const status = agentStatus(agent, activeCalls.map((c) => c.agent_id ?? ''));
            return (
              <div key={agent.id} style={{ animation: `card-in 0.3s ease ${idx * 0.04}s both` }}>
                <AgentCard
                  agent={agent} status={status}
                  onEdit={() => openEdit(agent)}
                  onTestCall={() => setTestCallAgent(agent)}
                  onDelete={() => setDeleteTarget(agent)}
                  onToggle={() => setDisableTarget(agent)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Agent Builder Modal ─────────────────────────────────────────────── */}
      {builderOpen && (
        <ModalBackdrop onClose={closeBuilder}>
          <div style={{ width: '100%', maxWidth: 1100, height: '88vh', background: '#0C1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden', animation: 'modal-in 0.28s cubic-bezier(0.16,1,0.3,1) forwards', boxShadow: '0 48px 140px rgba(0,0,0,0.65), 0 0 0 1px rgba(124,110,250,0.08)', display: 'flex', flexDirection: 'column' }}>
            <AgentBuilder agentId={editAgentId} onBack={closeBuilder} />
          </div>
        </ModalBackdrop>
      )}

      {/* ── Test Call Modal ─────────────────────────────────────────────────── */}
      {testCallAgent && (
        <ModalBackdrop onClose={() => setTestCallAgent(null)}>
          <div style={{ width: '100%', maxWidth: 980, height: '86vh', background: '#0C1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden', animation: 'modal-in 0.28s cubic-bezier(0.16,1,0.3,1) forwards', boxShadow: '0 48px 140px rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column' }}>
            {/* Test call modal header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#0C1120' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', fontFamily: 'var(--font-syne)' }}>Test Call</div>
                  <div style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-inter)' }}>{testCallAgent.name}</div>
                </div>
              </div>
              <button
                onClick={() => setTestCallAgent(null)}
                style={{ width: 32, height: 32, borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#94A3B8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#475569'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TestCallPanel
                agentId={testCallAgent.id}
                agentName={testCallAgent.name}
                isSynced={!!testCallAgent.elevenlabs_agent_id && !!testCallAgent.el_last_synced_at}
              />
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ── Delete Confirm Modal ────────────────────────────────────────────── */}
      {deleteTarget && (
        <DeleteAgentModal
          agent={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Toggle Active Modal ─────────────────────────────────────────────── */}
      {disableTarget && (
        <ToggleAgentModal
          agent={disableTarget}
          onClose={() => setDisableTarget(null)}
          onConfirm={async () => {
            await disableMutation.mutateAsync({ id: disableTarget.id, active: !disableTarget.is_active });
            setDisableTarget(null);
          }}
          isPending={disableMutation.isPending}
        />
      )}
    </div>
  );
}
