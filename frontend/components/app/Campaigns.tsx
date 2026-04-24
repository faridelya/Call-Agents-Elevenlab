'use client';

import { useState } from 'react';
import { useCampaigns, useCampaignAction, useCreateCampaign } from '@/lib/hooks/useCampaigns';
import { useAgents } from '@/lib/hooks/useAgents';
import type { Campaign } from '@/lib/api';

const statusColors: Record<Campaign['status'], string> = {
  running:   '#10B981',
  paused:    '#F59E0B',
  draft:     '#475569',
  scheduled: '#22D3EE',
  completed: '#7C6EFA',
  failed:    '#EF4444',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── New Campaign Modal ───────────────────────────────────────────────────────

function NewCampaignModal({ onClose, agentOptions }: { onClose: () => void; agentOptions: Array<{ id: string; name: string }> }) {
  const createCampaign = useCreateCampaign();
  const [name, setName]       = useState('');
  const [agentId, setAgentId] = useState(agentOptions[0]?.id ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  async function handleCreate() {
    if (!name || !agentId) return;
    setSaving(true);
    setError('');
    try {
      await createCampaign.mutateAsync({ name, agent_id: agentId });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: '#0C1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700, color: '#F1F5F9', marginBottom: 20 }}>New Campaign</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 6 }}>Campaign name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Sale Outreach" style={{ width: '100%', background: '#0F1623', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#F1F5F9', outline: 'none', fontFamily: 'var(--font-inter)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 6 }}>Agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ width: '100%', background: '#0F1623', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#F1F5F9', outline: 'none', fontFamily: 'var(--font-inter)' }}>
              {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {error && <div style={{ fontSize: 13, color: '#EF4444' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#64748B', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-inter)' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving || !name || !agentId} style={{ flex: 1, padding: '10px 0', background: '#7C6EFA', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-inter)', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaigns view ───────────────────────────────────────────────────────────

export function CampaignsView() {
  const { data, isLoading } = useCampaigns();
  const { data: agentsData } = useAgents();
  const campaignAction = useCampaignAction();
  const [showNew, setShowNew] = useState(false);

  const campaignList  = data?.items ?? [];
  const liveCount     = campaignList.filter((c) => c.status === 'running').length;
  const agentOptions  = (agentsData?.items ?? []).map((a) => ({ id: a.id, name: a.name }));

  return (
    <div style={{ padding: '28px 32px' }}>
      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} agentOptions={agentOptions} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 22, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', marginBottom: 3 }}>Campaigns</h1>
          <p style={{ fontSize: 12, color: '#475569' }}>{liveCount} active · {campaignList.length} total</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ background: '#7C6EFA', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-inter), sans-serif' }}
        >
          <span style={{ fontSize: 16 }}>+</span> New Campaign
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: '#475569', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading campaigns…</div>
      ) : campaignList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569' }}>
          <div style={{ fontSize: 13, marginBottom: 16 }}>No campaigns yet. Create one to start bulk dialing.</div>
          <button onClick={() => setShowNew(true)} style={{ background: '#7C6EFA', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-inter)' }}>+ New Campaign</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campaignList.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onAction={(action) => campaignAction.mutate({ id: c.id, action })}
              actionPending={campaignAction.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignRow({ campaign: c, onAction, actionPending }: {
  campaign: Campaign;
  onAction: (a: 'start' | 'pause' | 'resume' | 'stop') => void;
  actionPending: boolean;
}) {
  const [hov, setHov] = useState(false);
  const color = statusColors[c.status];
  const pct = c.total_contacts > 0 ? Math.round((c.contacts_called / c.total_contacts) * 100) : 0;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: '#0F1623', border: `1px solid ${hov ? 'rgba(124,110,250,0.25)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 20, transition: 'all 0.2s' }}
    >
      {/* Status dot */}
      <div style={{ flex: '0 0 8px', height: 8, borderRadius: '50%', background: color, boxShadow: c.status === 'running' ? `0 0 8px ${color}` : 'none' }} />

      {/* Name */}
      <div style={{ flex: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', marginBottom: 2 }}>{c.name}</div>
        <div style={{ fontSize: 11, color: '#475569' }}>Started {fmtDate(c.started_at)}</div>
      </div>

      {/* Progress */}
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#334155', marginBottom: 2 }}>Progress</div>
        <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#CBD5E1' }}>
          {c.contacts_called}<span style={{ fontSize: 11, color: '#334155' }}>/{c.total_contacts || '?'}</span>
        </div>
      </div>

      {/* Progress bar */}
      {c.total_contacts > 0 && (
        <div style={{ flex: 2 }}>
          <div style={{ height: 4, background: '#1E293B', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#7C6EFA', borderRadius: 9999, transition: 'width 0.5s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#334155', marginTop: 4, textAlign: 'right' }}>{pct}% complete</div>
        </div>
      )}

      {/* Conversion */}
      {c.conversion_rate != null && (
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#334155', marginBottom: 2 }}>Conversion</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#10B981' }}>{c.conversion_rate}%</div>
        </div>
      )}

      {/* Status badge */}
      <div style={{ flex: 1, textAlign: 'right' }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999, background: `${color}14`, color, border: `1px solid ${color}25`, textTransform: 'capitalize' }}>
          {c.status}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        {c.status === 'draft' && (
          <ActionBtn onClick={() => onAction('start')} disabled={actionPending} color="#10B981" label="Start" />
        )}
        {c.status === 'running' && (
          <ActionBtn onClick={() => onAction('pause')} disabled={actionPending} color="#F59E0B" label="Pause" />
        )}
        {c.status === 'paused' && (
          <>
            <ActionBtn onClick={() => onAction('resume')} disabled={actionPending} color="#10B981" label="Resume" />
            <ActionBtn onClick={() => onAction('stop')} disabled={actionPending} color="#EF4444" label="Stop" />
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ onClick, disabled, color, label }: { onClick: () => void; disabled: boolean; color: string; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: '4px 10px', background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 6, color, fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-inter)', opacity: disabled ? 0.5 : 1 }}
    >
      {label}
    </button>
  );
}
