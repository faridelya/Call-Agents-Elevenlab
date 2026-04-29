'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCampaigns, useCampaignAction, useCreateCampaign } from '@/lib/hooks/useCampaigns';
import { useAgents } from '@/lib/hooks/useAgents';
import type { Campaign } from '@/lib/api';
import { contactPool as poolApi } from '@/lib/api';

const SC: Record<Campaign['status'], string> = {
  running: '#00D082', paused: '#F0B429', draft: '#3D607A',
  scheduled: '#38BDF8', completed: '#00C2B8', failed: '#FF4D6D',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ContactEntry {
  id: string;
  phone: string;
  name: string;
  product_service: string;
  group: string;
  date: string;
  agent_id?: string;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = 12, r = 5 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.04) 75%)',
      backgroundSize: '800px 100%', animation: 'shimmer 1.8s infinite linear',
    }} />
  );
}

// ── Shared input field ─────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5,
      }}>
        {label}{required && <span style={{ color: '#FF4D6D', marginLeft: 3 }}>*</span>}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${focused ? 'rgba(0,208,130,0.45)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8, padding: '7px 10px',
          fontSize: 12, color: 'var(--text-primary)', outline: 'none',
          boxShadow: focused ? '0 0 0 3px rgba(0,208,130,0.07)' : 'none',
          transition: 'border-color 0.18s, box-shadow 0.18s',
          fontFamily: 'var(--font-ui)',
        }}
      />
    </div>
  );
}

// ── Tag Input ──────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');
  function addTag() {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  }
  return (
    <div style={{
      minHeight: 40, padding: '5px 8px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
    }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 6,
          background: 'rgba(0,208,130,0.08)', border: '1px solid rgba(0,208,130,0.22)',
          fontSize: 11, color: '#00D082',
        }}>
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} style={{
            background: 'none', border: 'none', color: '#00D082', cursor: 'pointer',
            fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.65,
          }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
        placeholder={tags.length === 0 ? 'Type and press Enter…' : ''}
        style={{
          flex: 1, minWidth: 80, background: 'none', border: 'none', outline: 'none',
          fontSize: 12.5, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
        }}
      />
    </div>
  );
}

// ── Agent Option (dropdown item) ───────────────────────────────────────────────
function AgentOption({ agent, selected, onClick }: {
  agent: { id: string; name: string };
  selected: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 14px',
        background: selected ? 'rgba(0,208,130,0.08)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer', fontSize: 12.5,
        color: selected ? '#00D082' : 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)', textAlign: 'left',
        transition: 'background 0.12s',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: selected ? '#00D082' : 'rgba(255,255,255,0.15)',
        boxShadow: selected ? '0 0 6px rgba(0,208,130,0.6)' : 'none',
        transition: 'all 0.12s',
      }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agent.name}
      </span>
      {selected && (
        <svg style={{ flexShrink: 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00D082" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

// ── Beautiful Searchable Agent Selector ────────────────────────────────────────
function AgentSelect({ agents, value, onChange, placeholder = 'Select Agent' }: {
  agents: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = agents.filter(a => a.name.toLowerCase().includes(query.toLowerCase()));
  const selected = agents.find(a => a.id === value);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(''); }}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: open ? 'rgba(0,208,130,0.04)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'rgba(0,208,130,0.5)' : 'rgba(255,255,255,0.09)'}`,
          borderRadius: 8, padding: '8px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 12.5, fontFamily: 'var(--font-ui)',
          boxShadow: open ? '0 0 0 3px rgba(0,208,130,0.07)' : 'none',
          transition: 'border-color 0.18s, box-shadow 0.18s, background 0.18s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1, minWidth: 0 }}>
          {selected ? (
            <>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: '#00D082', boxShadow: '0 0 7px rgba(0,208,130,0.8)',
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
            </>
          ) : (
            <>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.12)',
              }} />
              <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>
            </>
          )}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.45, flexShrink: 0, marginLeft: 8 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'rgba(6,12,24,0.98)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(0,208,130,0.22)', borderRadius: 10,
          overflow: 'hidden', zIndex: 200,
          boxShadow: '0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,208,130,0.05)',
          animation: 'modal-in 0.14s cubic-bezier(0.16,1,0.3,1)',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter by name…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 7, padding: '6px 8px 6px 28px',
                  fontSize: 11.5, color: 'var(--text-primary)',
                  outline: 'none', fontFamily: 'var(--font-ui)',
                }}
              />
            </div>
          </div>

          {/* Clear */}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer', fontSize: 11.5,
                color: 'rgba(255,77,109,0.65)', fontFamily: 'var(--font-ui)',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Clear selection
            </button>
          )}

          {/* List */}
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {agents.length === 0 ? (
              <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                No agents available
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                No agents match &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map(a => (
                <AgentOption key={a.id} agent={a} selected={value === a.id}
                  onClick={() => { onChange(a.id); setOpen(false); setQuery(''); }} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contact Edit Modal ─────────────────────────────────────────────────────────
function ContactEditModal({ contact, agentOptions, onSave, onClose }: {
  contact: ContactEntry;
  agentOptions: Array<{ id: string; name: string }>;
  onSave: (updated: ContactEntry) => void;
  onClose: () => void;
}) {
  const [phone, setPhone]   = useState(contact.phone);
  const [name, setName]     = useState(contact.name);
  const [product, setProduct] = useState(contact.product_service);
  const [group, setGroup]   = useState(contact.group);
  const [agentId, setAgentId] = useState(contact.agent_id ?? '');

  function handleSave() {
    if (!phone.trim()) return;
    onSave({
      ...contact,
      phone: phone.trim(), name: name.trim(),
      product_service: product.trim(), group: group.trim(),
      agent_id: agentId || undefined,
    });
    onClose();
  }

  const canSave = phone.trim().length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.90)',
      backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1001,
    }}>
      <div style={{
        background: 'rgba(9,18,34,0.98)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(56,189,248,0.2)', borderRadius: 20,
        width: 460, maxWidth: '94vw',
        boxShadow: '0 24px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(56,189,248,0.04)',
        position: 'relative', overflow: 'hidden',
        animation: 'modal-in 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #38BDF8, #00C2B8, transparent)',
        }} />

        {/* Header */}
        <div style={{
          padding: '22px 26px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <h2 style={{ fontFamily: 'var(--font-syne)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                Edit Contact
              </h2>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 35 }}>
              Update details and agent assignment
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555 234 7890" required />
          <Field label="Name" value={name} onChange={setName} placeholder="John Smith" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Product / Service" value={product} onChange={setProduct} placeholder="Enterprise Plan" />
            <Field label="Group" value={group} onChange={setGroup} placeholder="A" />
          </div>
          <div>
            <label style={{
              display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
            }}>
              Assigned Agent
            </label>
            <AgentSelect
              agents={agentOptions}
              value={agentId}
              onChange={setAgentId}
              placeholder="No agent assigned (optional)"
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 26px 24px', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 2, padding: '10px', borderRadius: 10,
              background: canSave ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${canSave ? 'rgba(56,189,248,0.38)' : 'rgba(255,255,255,0.08)'}`,
              color: canSave ? '#38BDF8' : 'var(--text-muted)',
              fontSize: 12.5, fontWeight: 600,
              cursor: canSave ? 'pointer' : 'not-allowed',
              boxShadow: canSave ? '0 0 16px rgba(56,189,248,0.1)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Campaign Modal ─────────────────────────────────────────────────────────
function NewCampaignModal({ onClose, agentOptions, contactGroups, allContacts }: {
  onClose: () => void;
  agentOptions: Array<{ id: string; name: string }>;
  contactGroups: string[];
  allContacts: ContactEntry[];
}) {
  const createCampaign = useCreateCampaign();
  const [selectedGroup, setSelectedGroup] = useState('');
  const [agentId, setAgentId] = useState(agentOptions[0]?.id ?? '');
  const [tags, setTags] = useState<string[]>([]);
  const [parallelCalls, setParallelCalls] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    if (!agentId) return;
    setSaving(true); setError('');
    try {
      const name = `Campaign — ${selectedGroup ? `Group ${selectedGroup}` : 'All'} — ${new Date().toLocaleDateString()}`;
      const campaign = await createCampaign.mutateAsync({
        name, agent_id: agentId,
        max_concurrent_calls: parallelCalls,
      });

      const contactsToUpload = selectedGroup
        ? allContacts.filter((c) => c.group === selectedGroup)
        : allContacts;

      if (contactsToUpload.length > 0 && campaign?.id) {
        const today = new Date().toISOString().split('T')[0];
        const csv = ['phone,name,product,group,date',
          ...contactsToUpload.map((c) =>
            `${c.phone},${c.name},${c.product_service},${c.group},${c.date || today}`
          )
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const fd = new FormData();
        fd.append('file', blob, 'contacts.csv');
        await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/campaigns/${campaign.id}/contacts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${(await import('@/lib/api')).tokenStore.get()}` },
          body: fd,
        });
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create campaign');
    } finally { setSaving(false); }
  }

  const canStart = !!agentId && !saving;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.88)',
      backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{
        background: 'rgba(9,18,34,0.98)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(0,208,130,0.18)', borderRadius: 20,
        width: 460, maxWidth: '92vw',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        position: 'relative', overflow: 'hidden',
        animation: 'modal-in 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #00D082, #00C2B8, transparent)',
        }} />

        {/* Header */}
        <div style={{
          padding: '26px 28px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-syne)', fontSize: 18, fontWeight: 700,
              color: 'var(--text-primary)', marginBottom: 4,
            }}>Launch Campaign</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Configure and start a new outreach campaign</p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Contact Group */}
          <div>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
            }}>
              Contact Group <span style={{ color: '#FF4D6D' }}>*</span>
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10,
                padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
                outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">— All contacts ({allContacts.length}) —</option>
              {contactGroups.map((g) => {
                const count = allContacts.filter((c) => c.group === g).length;
                return <option key={g} value={g}>Group {g} — {count} contact{count !== 1 ? 's' : ''}</option>;
              })}
            </select>
            {allContacts.length === 0 && (
              <p style={{ fontSize: 11, color: '#F0B429', marginTop: 6 }}>
                ⚠ Add contacts to the pool first using the panels on the page
              </p>
            )}
          </div>

          {/* Agent */}
          <div>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
            }}>
              Agent <span style={{ color: '#FF4D6D' }}>*</span>
            </label>
            <AgentSelect
              agents={agentOptions}
              value={agentId}
              onChange={setAgentId}
              placeholder="Select agent for this campaign"
            />
          </div>

          {/* Tags */}
          <div>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
            }}>Tags</label>
            <TagInput tags={tags} onChange={setTags} />
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>Press Enter or comma to add</p>
          </div>

          {/* Parallel Calls slider */}
          <div>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10,
            }}>
              Parallel Calls
              <span style={{
                marginLeft: 8, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                color: parallelCalls > 1 ? '#00D082' : 'var(--text-secondary)',
                letterSpacing: 0, textTransform: 'none',
              }}>{parallelCalls}</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>1</span>
              <input
                type="range" min={1} max={10} value={parallelCalls}
                onChange={(e) => setParallelCalls(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#00D082', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>10</span>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>
              {parallelCalls === 1
                ? 'Serial — one call at a time'
                : `${parallelCalls} simultaneous calls running in parallel`}
            </p>
          </div>

          {error && (
            <div style={{
              background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#FF4D6D',
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 28px 24px', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '11px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={handleStart}
            disabled={!canStart}
            style={{
              flex: 2, padding: '11px', borderRadius: 10,
              background: canStart
                ? 'linear-gradient(135deg, rgba(0,208,130,0.22) 0%, rgba(0,194,184,0.14) 100%)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${canStart ? 'rgba(0,208,130,0.45)' : 'rgba(255,255,255,0.08)'}`,
              color: canStart ? '#00D082' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 600,
              cursor: canStart ? 'pointer' : 'not-allowed',
              boxShadow: canStart ? '0 0 20px rgba(0,208,130,0.14)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {saving ? 'Launching…' : '▶ Start Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Add Panel ───────────────────────────────────────────────────────────
function ManualAddPanel({ onAdd, nextGroup, agentOptions }: {
  onAdd: (c: ContactEntry) => void;
  nextGroup: string;
  agentOptions: Array<{ id: string; name: string }>;
}) {
  const [phone, setPhone]     = useState('');
  const [name, setName]       = useState('');
  const [product, setProduct] = useState('');
  const [group, setGroup]     = useState('');
  const [agentId, setAgentId] = useState('');

  function handleAdd() {
    if (!phone.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    onAdd({
      id: genId(),
      phone: phone.trim(), name: name.trim(),
      product_service: product.trim(),
      group: group.trim() || nextGroup,
      date: today,
      agent_id: agentId || undefined,
    });
    setPhone(''); setName(''); setProduct(''); setGroup(''); setAgentId('');
  }

  const canAdd = phone.trim().length > 0;

  return (
    <div style={{
      background: 'rgba(9,20,38,0.65)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(0,208,130,0.5), transparent)',
      }} />
      <h3 style={{
        fontFamily: 'var(--font-syne)', fontSize: 13, fontWeight: 700,
        color: 'var(--text-primary)', marginBottom: 14, letterSpacing: '-0.01em',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 7,
          background: 'rgba(0,208,130,0.1)', border: '1px solid rgba(0,208,130,0.25)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        }}>+</span>
        Add Contact Manually
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555 234 7890" required />
        <Field label="Name" value={name} onChange={setName} placeholder="John Smith" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Product / Service" value={product} onChange={setProduct} placeholder="Enterprise Plan" />
          <Field label="Group" value={group} onChange={setGroup} placeholder={nextGroup} />
        </div>

        {/* Agent selector */}
        <div>
          <label style={{
            display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
          }}>
            Assign Agent
          </label>
          <AgentSelect
            agents={agentOptions}
            value={agentId}
            onChange={setAgentId}
            placeholder="Select agent (optional)"
          />
        </div>

        <button
          onClick={handleAdd} disabled={!canAdd}
          style={{
            width: '100%', padding: '9px', borderRadius: 10, marginTop: 2,
            background: canAdd ? 'rgba(0,208,130,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${canAdd ? 'rgba(0,208,130,0.35)' : 'rgba(255,255,255,0.08)'}`,
            color: canAdd ? '#00D082' : 'var(--text-muted)',
            fontSize: 12.5, fontWeight: 600, cursor: canAdd ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          + Add to Contact Pool
        </button>
      </div>
    </div>
  );
}

// ── CSV Upload Panel ───────────────────────────────────────────────────────────
function CSVUploadPanel({ onAdd, agentOptions }: {
  onAdd: (cs: ContactEntry[]) => void;
  agentOptions: Array<{ id: string; name: string }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview]   = useState<ContactEntry[]>([]);
  const [fileName, setFileName] = useState('');
  const [err, setErr]           = useState('');
  const [csvAgentId, setCsvAgentId] = useState('');
  const [csvGroup, setCsvGroup]     = useState('');

  function parseRows(rows: Record<string, unknown>[]) {
    if (rows.length === 0) { setErr('File has no data rows.'); return; }

    // Normalize header keys: lowercase, trim, strip BOM/quotes
    const normalize = (k: string) =>
      String(k).trim().toLowerCase().replace(/^﻿/, '').replace(/^["']|["']$/g, '').trim();

    const rawKeys = Object.keys(rows[0]);
    const keyMap: Record<string, string> = {};
    for (const k of rawKeys) keyMap[normalize(k)] = k;

    const keys = Object.keys(keyMap);
    if (!keys.includes('phone')) {
      const found = keys.filter(Boolean).join(', ') || '(none detected)';
      setErr(`Required column "phone" not found. Columns detected: ${found}`);
      return;
    }

    const col = (row: Record<string, unknown>, norm: string): string => {
      const orig = keyMap[norm];
      return orig ? String(row[orig] ?? '').trim() : '';
    };

    const prodKey = keys.includes('product_service') ? 'product_service' : 'product';
    const today = new Date().toISOString().split('T')[0];

    const parsed: ContactEntry[] = [];
    for (let i = 0; i < Math.min(rows.length, 200); i++) {
      const row = rows[i];
      const phone = col(row, 'phone');
      if (!phone) continue;

      let name = col(row, 'name');
      if (!name) {
        const fn = col(row, 'first_name');
        const ln = col(row, 'last_name');
        name = [fn, ln].filter(Boolean).join(' ');
      }

      parsed.push({
        id: genId(),
        phone,
        name,
        product_service: col(row, prodKey),
        group: col(row, 'group') || String(i + 1),
        date: today,
      });
    }
    setPreview(parsed);
  }

  function parse(file: File) {
    setErr(''); setFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      // Excel: read as ArrayBuffer and use SheetJS
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const data = e.target?.result as ArrayBuffer;
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          // header: 1 → array of arrays; defval: '' fills empty cells
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          parseRows(rows);
        } catch {
          setErr('Could not read Excel file. Try saving it as CSV and uploading that instead.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / TSV: read as text
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const text = e.target?.result as string;
          const wb = XLSX.read(text, { type: 'string' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          parseRows(rows);
        } catch {
          setErr('Could not parse CSV file. Make sure it has a header row with a "phone" column.');
        }
      };
      reader.readAsText(file);
    }
  }

  function confirm() {
    // Apply agent + group overrides at confirm time
    const today = new Date().toISOString().split('T')[0];
    const final = preview.map(c => ({
      ...c,
      date: c.date || today,
      agent_id: csvAgentId || undefined,
      group: csvGroup.trim() ? csvGroup.trim() : c.group,
    }));
    onAdd(final);
    setPreview([]); setFileName(''); setCsvAgentId(''); setCsvGroup('');
  }
  function reset() { setPreview([]); setFileName(''); setErr(''); }

  return (
    <div style={{
      background: 'rgba(9,20,38,0.65)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.5), transparent)',
      }} />
      <h3 style={{
        fontFamily: 'var(--font-syne)', fontSize: 13, fontWeight: 700,
        color: 'var(--text-primary)', marginBottom: 14, letterSpacing: '-0.01em',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 7,
          background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
        }}>↑</span>
        Import CSV / Excel
      </h3>

      {/* Agent + Group — always visible */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{
            display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
          }}>
            Assign Agent to All Imported Contacts
          </label>
          <AgentSelect
            agents={agentOptions}
            value={csvAgentId}
            onChange={setCsvAgentId}
            placeholder="Select agent (optional)"
          />
        </div>
        <div>
          <label style={{
            display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5,
          }}>
            Override Group for All <span style={{ opacity: 0.55, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(leave blank to use CSV values)</span>
          </label>
          <input
            value={csvGroup}
            onChange={e => setCsvGroup(e.target.value)}
            placeholder="e.g.  A  or  2026-Q2  (optional)"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${csvGroup ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8, padding: '7px 10px',
              fontSize: 12, color: 'var(--text-primary)', outline: 'none',
              fontFamily: 'var(--font-ui)', transition: 'border-color 0.18s',
            }}
          />
        </div>
      </div>

      {/* Drop zone / preview */}
      {preview.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) parse(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.09)'}`,
            borderRadius: 12, padding: '20px 16px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'rgba(56,189,248,0.04)' : 'rgba(255,255,255,0.01)',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Drop CSV / Excel or click to browse
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            Required: <code style={{ color: '#38BDF8', fontSize: 10 }}>phone</code>
            {' '}· Optional: name, product_service, group · date auto-assigned
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parse(f); }} />
        </div>
      ) : (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(0,208,130,0.06)', border: '1px solid rgba(0,208,130,0.15)',
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#00D082' }}>{fileName}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                {preview.length} contacts ready
                {csvAgentId && agentOptions.find(a => a.id === csvAgentId) && (
                  <span style={{ color: '#00D082' }}>
                    {' '}· agent: {agentOptions.find(a => a.id === csvAgentId)!.name}
                  </span>
                )}
                {csvGroup.trim() && (
                  <span style={{ color: '#38BDF8' }}> · group: {csvGroup.trim()}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{
              flex: 1, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer',
            }}>Discard</button>
            <button onClick={confirm} style={{
              flex: 2, padding: '8px', borderRadius: 8, background: 'rgba(56,189,248,0.09)',
              border: '1px solid rgba(56,189,248,0.28)', color: '#38BDF8',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            }}>Import {preview.length} Contacts</button>
          </div>
        </div>
      )}
      {err && (
        <div style={{
          marginTop: 10, padding: '9px 12px', borderRadius: 8,
          background: 'rgba(255,77,109,0.07)', border: '1px solid rgba(255,77,109,0.18)',
          fontSize: 11, color: '#FF4D6D', lineHeight: 1.5,
        }}>
          {err}
        </div>
      )}
    </div>
  );
}

// shared grid template — used by both header row and data rows
const ROW_COLS = '2fr 2fr 1fr 1fr 1fr 1fr 88px';

// ── Contact Row ────────────────────────────────────────────────────────────────
function ContactRow({ contact: c, onRemove, onEdit, agentOptions, striped }: {
  contact: ContactEntry;
  onRemove: (id: string) => void;
  onEdit: (c: ContactEntry) => void;
  agentOptions: Array<{ id: string; name: string }>;
  striped: boolean;
}) {
  const [hov, setHov]             = useState(false);
  const [confirming, setConfirming] = useState(false);
  const assignedAgent = agentOptions.find(a => a.id === c.agent_id);

  function handleDeleteClick() { setConfirming(true); }
  function handleConfirm()     { onRemove(c.id); }
  function handleCancel()      { setConfirming(false); }

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => { setHov(false); }}
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        background: confirming
          ? 'rgba(255,77,109,0.04)'
          : hov ? 'rgba(0,208,130,0.025)'
          : striped ? 'rgba(255,255,255,0.01)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      {/* Normal row */}
      <div style={{
        display: 'grid', gridTemplateColumns: ROW_COLS,
        padding: '8px 20px', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.phone}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || '—'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.product_service || '—'}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
          background: 'rgba(56,189,248,0.08)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.15)',
          display: 'inline-block', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          justifySelf: 'start',
        }}>{c.group || '—'}</span>

        {/* Agent badge */}
        <div style={{ overflow: 'hidden' }}>
          {assignedAgent ? (
            <span style={{
              display: 'inline-block', maxWidth: '100%',
              padding: '2px 6px', borderRadius: 4,
              background: 'rgba(0,208,130,0.07)', color: '#00D082',
              border: '1px solid rgba(0,208,130,0.18)',
              fontSize: 9.5, fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {assignedAgent.name}
            </span>
          ) : (
            <span style={{ color: 'var(--text-disabled)', fontSize: 9.5 }}>—</span>
          )}
        </div>

        {/* Date */}
        <span style={{
          fontSize: 9.5, fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)', whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {c.date ? (
            <>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ opacity: 0.4, flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {c.date}
            </>
          ) : '—'}
        </span>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          {!confirming && (
            <button
              onClick={() => onEdit(c)}
              title="Edit contact"
              style={{
                background: 'none', border: 'none', padding: '3px',
                color: hov ? '#38BDF8' : 'var(--text-disabled)',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                transition: 'color 0.15s', borderRadius: 4,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          <button
            onClick={confirming ? handleCancel : handleDeleteClick}
            title={confirming ? 'Cancel' : 'Remove contact'}
            style={{
              background: 'none', border: 'none', padding: '3px',
              color: confirming ? '#F0B429' : hov ? '#FF4D6D' : 'var(--text-disabled)',
              cursor: 'pointer', fontSize: confirming ? 11 : 16, lineHeight: 1,
              fontWeight: confirming ? 700 : 400,
              transition: 'color 0.15s',
            }}
          >{confirming ? 'Cancel' : '×'}</button>
        </div>
      </div>

      {/* Confirmation bar — slides in below the row */}
      {confirming && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 20px 9px',
          background: 'rgba(255,77,109,0.05)',
          borderTop: '1px solid rgba(255,77,109,0.1)',
          animation: 'fade-in 0.15s both',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FF4D6D" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          <span style={{ fontSize: 11, color: 'rgba(255,77,109,0.85)', flex: 1 }}>
            Remove <strong style={{ fontFamily: 'var(--font-mono)' }}>{c.phone}</strong>
            {c.name ? ` (${c.name})` : ''}? This will be deleted from the pool.
          </span>
          <button
            onClick={handleConfirm}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: 'rgba(255,77,109,0.14)', border: '1px solid rgba(255,77,109,0.38)',
              color: '#FF4D6D', cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,109,0.24)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,77,109,0.14)'; }}
          >
            Yes, Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Contacts Pool Panel ────────────────────────────────────────────────────────
function ContactsPoolPanel({ contacts, onRemove, onEdit, agentOptions }: {
  contacts: ContactEntry[];
  onRemove: (id: string) => void;
  onEdit: (c: ContactEntry) => void;
  agentOptions: Array<{ id: string; name: string }>;
}) {
  const [search, setSearch]   = useState('');
  const [focused, setFocused] = useState(false);

  const filtered = contacts.filter((c) =>
    [c.phone, c.name, c.group, c.product_service].some((v) =>
      v.toLowerCase().includes(search.toLowerCase())
    )
  );

  const groups = [...new Set(contacts.map((c) => c.group))].filter(Boolean).sort();

  return (
    <div style={{
      background: 'rgba(9,20,38,0.65)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.015)', position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.4), rgba(0,208,130,0.4), transparent)',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{
            fontFamily: 'var(--font-syne)', fontSize: 14, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.01em',
          }}>Contact Pool</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 9999,
              background: 'rgba(0,208,130,0.09)', color: '#00D082', border: '1px solid rgba(0,208,130,0.2)',
            }}>{contacts.length} contacts</span>
            {groups.length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 9999,
                background: 'rgba(56,189,248,0.09)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.2)',
              }}>{groups.length} groups</span>
            )}
          </div>
        </div>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${focused ? 'rgba(0,208,130,0.35)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 9, padding: '7px 10px 7px 30px',
              fontSize: 12, color: 'var(--text-primary)', outline: 'none',
              transition: 'border-color 0.18s', fontFamily: 'var(--font-ui)',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 180, maxHeight: 420 }}>
        {contacts.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '52px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>👥</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>No contacts yet</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-disabled)', maxWidth: 220 }}>
              Add contacts manually or import from CSV / Excel using the panels on the right
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No contacts match &ldquo;{search}&rdquo;
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: ROW_COLS,
              padding: '7px 20px', background: 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)',
            }}>
              <span>Phone</span><span>Name</span><span>Product</span><span>Group</span><span>Agent</span><span>Date</span><span />
            </div>
            {filtered.map((c, i) => (
              <ContactRow
                key={c.id} contact={c}
                onRemove={onRemove} onEdit={onEdit}
                agentOptions={agentOptions}
                striped={i % 2 === 1}
              />
            ))}
          </>
        )}
      </div>

      {/* Group summary */}
      {groups.length > 0 && (
        <div style={{
          padding: '8px 20px', borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', gap: 5, flexWrap: 'wrap', background: 'rgba(255,255,255,0.01)', flexShrink: 0,
        }}>
          {groups.map((g) => {
            const cnt = contacts.filter((c) => c.group === g).length;
            return (
              <span key={g} style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                background: 'rgba(56,189,248,0.07)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.15)',
              }}>Grp {g}: {cnt}</span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Campaign Action Error Modal ────────────────────────────────────────────────
function CampaignActionErrorModal({ message, action, onClose }: {
  message: string;
  action: string;
  onClose: () => void;
}) {
  const actionLabel = action === 'start' ? 'start' : action === 'pause' ? 'pause' : action === 'resume' ? 'resume' : 'stop';
  const title = `Could not ${actionLabel} campaign`;

  const hasSettingsHint = message.toLowerCase().includes('settings');
  const parts = hasSettingsHint ? message.split(/(Settings\s*→\s*\S+(?:\s+\S+)*)/g) : [message];

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(2,6,16,0.82)',
      backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100,
      animation: 'fade-in 0.18s both',
    }}>
      <div style={{
        background: 'rgba(9,18,34,0.98)',
        backdropFilter: 'blur(32px)',
        border: '1px solid rgba(255,77,109,0.22)',
        borderRadius: 20,
        width: 480, maxWidth: '92vw',
        boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,77,109,0.06)',
        position: 'relative', overflow: 'hidden',
        animation: 'modal-in 0.28s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #FF4D6D, #F0B429 70%, transparent)',
        }} />

        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: 180, height: 180,
          background: 'radial-gradient(circle at 100% 0%, rgba(255,77,109,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, lineHeight: 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,77,109,0.1)';
            e.currentTarget.style.borderColor = 'rgba(255,77,109,0.3)';
            e.currentTarget.style.color = '#FF4D6D';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
          }}
        >×</button>

        <div style={{ padding: '28px 28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: 'rgba(255,77,109,0.1)',
              border: '1px solid rgba(255,77,109,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(255,77,109,0.12)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF4D6D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>

            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{
                fontFamily: 'var(--font-syne)', fontSize: 17, fontWeight: 700,
                color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 4,
              }}>{title}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,77,109,0.7)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Action blocked
              </div>
            </div>
          </div>

          <div style={{
            background: 'rgba(255,77,109,0.05)',
            border: '1px solid rgba(255,77,109,0.14)',
            borderRadius: 12, padding: '14px 16px',
            fontSize: 13, lineHeight: 1.65,
            color: 'rgba(255,255,255,0.75)',
            marginBottom: 22,
          }}>
            {parts.map((part, i) => {
              if (/Settings\s*→/.test(part)) {
                return (
                  <span key={i} style={{
                    color: '#F0B429',
                    fontWeight: 600,
                    background: 'rgba(240,180,41,0.1)',
                    border: '1px solid rgba(240,180,41,0.22)',
                    borderRadius: 5,
                    padding: '0px 6px',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    display: 'inline-block',
                    margin: '0 2px',
                  }}>{part}</span>
                );
              }
              return <span key={i}>{part}</span>;
            })}
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '11px',
              borderRadius: 11,
              background: 'linear-gradient(135deg, rgba(0,208,130,0.16) 0%, rgba(0,194,184,0.10) 100%)',
              border: '1px solid rgba(0,208,130,0.38)',
              color: '#00D082', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(0,208,130,0.10)',
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 0 28px rgba(0,208,130,0.22)';
              e.currentTarget.style.borderColor = 'rgba(0,208,130,0.55)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0,208,130,0.10)';
              e.currentTarget.style.borderColor = 'rgba(0,208,130,0.38)';
            }}
          >Got it</button>
        </div>
      </div>
    </div>
  );
}

// ── Campaign Card ──────────────────────────────────────────────────────────────
function CampaignCard({ campaign: c, onAction, actionPending }: {
  campaign: Campaign; onAction: (a: 'start' | 'pause' | 'resume' | 'stop') => void; actionPending: boolean;
}) {
  const [hov, setHov] = useState(false);
  const color = SC[c.status];
  const pct = c.total_contacts > 0 ? Math.round((c.contacts_called / c.total_contacts) * 100) : 0;

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: 'rgba(9,20,38,0.65)', backdropFilter: 'blur(20px)',
        border: `1px solid ${hov ? `${color}28` : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16, padding: '20px 22px',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${color}10` : '0 4px 20px rgba(0,0,0,0.35)',
        transition: 'all 0.25s var(--ease-out)', overflow: 'hidden', position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 100, height: 100, background: `radial-gradient(circle at 100% 0%, ${color}10 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
            boxShadow: c.status === 'running' ? `0 0 10px ${color}` : 'none',
            animation: c.status === 'running' ? 'glow-pulse 2s infinite' : 'none',
          }} />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{c.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.started_at ? `Started ${fmtDate(c.started_at)}` : 'Not started'}</div>
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 9999,
          background: `${color}12`, color, border: `1px solid ${color}28`, textTransform: 'capitalize',
        }}>{c.status}</span>
      </div>

      {c.total_contacts > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Progress</span>
            <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {c.contacts_called}<span style={{ color: 'var(--text-muted)' }}>/{c.total_contacts}</span>
              <span style={{ marginLeft: 8, color, fontWeight: 700 }}>{pct}%</span>
            </span>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: 9999,
              boxShadow: `0 0 8px ${color}40`, transition: 'width 0.8s var(--ease-out)',
            }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {c.conversion_rate != null
          ? <span style={{ fontSize: 11.5, color: '#00D082', fontWeight: 600 }}>{c.conversion_rate}% conversion</span>
          : <span />}
        <div style={{ display: 'flex', gap: 6 }}>
          {c.status === 'draft'   && <ABtn onClick={() => onAction('start')}  disabled={actionPending} color="#00D082" label="▶ Start" />}
          {c.status === 'running' && <ABtn onClick={() => onAction('pause')}  disabled={actionPending} color="#F0B429" label="⏸ Pause" />}
          {c.status === 'paused'  && <>
            <ABtn onClick={() => onAction('resume')} disabled={actionPending} color="#00D082" label="▶ Resume" />
            <ABtn onClick={() => onAction('stop')}   disabled={actionPending} color="#FF4D6D" label="■ Stop" />
          </>}
        </div>
      </div>
    </div>
  );
}

function ABtn({ onClick, disabled, color, label }: { onClick: () => void; disabled: boolean; color: string; label: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: '5px 12px', background: hov ? `${color}18` : `${color}0E`,
        border: `1px solid ${hov ? `${color}45` : `${color}25`}`,
        borderRadius: 7, color, fontSize: 11, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );
}

const POOL_KEY = 'voxara_contact_pool';

// ── Campaigns View ─────────────────────────────────────────────────────────────
export function CampaignsView() {
  const { data, isLoading } = useCampaigns();
  const { data: agentsData } = useAgents();
  const campaignAction = useCampaignAction();
  const [showNew, setShowNew]       = useState(false);
  const [editTarget, setEditTarget] = useState<ContactEntry | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [actionError, setActionError] = useState<{ message: string; action: string } | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLoadFromDb = useRef(false);

  // Restore contact pool: prefer localStorage for instant load, then sync with DB
  const [contactPool, setPool] = useState<ContactEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(POOL_KEY);
      return saved ? (JSON.parse(saved) as ContactEntry[]) : [];
    } catch { return []; }
  });

  // On mount: load from DB once and merge (DB is the source of truth)
  useEffect(() => {
    if (didLoadFromDb.current) return;
    didLoadFromDb.current = true;
    poolApi.get()
      .then(res => {
        const dbContacts = (res.contacts ?? []) as ContactEntry[];
        if (dbContacts.length > 0) {
          setPool(dbContacts);
          try { localStorage.setItem(POOL_KEY, JSON.stringify(dbContacts)); } catch {}
        }
      })
      .catch(() => { /* offline or not authed — keep localStorage data */ });
  }, []);

  // Debounced save: 1.5 s after last change, persist to DB + localStorage
  const saveToDb = useCallback((pool: ContactEntry[]) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncStatus('syncing');
    syncTimer.current = setTimeout(async () => {
      try {
        await poolApi.save(pool);
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
      } catch {
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    }, 1500);
  }, []);

  // Keep localStorage + DB in sync whenever the pool changes (skip the initial load)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    try { localStorage.setItem(POOL_KEY, JSON.stringify(contactPool)); } catch {}
    saveToDb(contactPool);
  }, [contactPool, saveToDb]);

  const campaignList  = data?.items ?? [];
  const liveCount     = campaignList.filter((c) => c.status === 'running').length;
  const agentOptions  = (agentsData?.items ?? []).map((a) => ({ id: a.id, name: a.name }));
  const contactGroups = [...new Set(contactPool.map((c) => c.group))].filter(Boolean).sort();
  const nextGroup     = contactPool.length === 0
    ? '1'
    : String(Math.max(...contactPool.map((c) => parseInt(c.group) || 0), 0) + 1);

  function addContacts(cs: ContactEntry[]) { setPool((prev) => [...prev, ...cs]); }
  function removeContact(id: string)       { setPool((prev) => prev.filter((c) => c.id !== id)); }
  function updateContact(updated: ContactEntry) {
    setPool((prev) => prev.map((c) => c.id === updated.id ? updated : c));
  }

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', animation: 'fade-in 0.4s both' }}>
      {showNew && (
        <NewCampaignModal
          onClose={() => setShowNew(false)}
          agentOptions={agentOptions}
          contactGroups={contactGroups}
          allContacts={contactPool}
        />
      )}
      {editTarget && (
        <ContactEditModal
          contact={editTarget}
          agentOptions={agentOptions}
          onSave={updateContact}
          onClose={() => setEditTarget(null)}
        />
      )}
      {actionError && (
        <CampaignActionErrorModal
          message={actionError.message}
          action={actionError.action}
          onClose={() => setActionError(null)}
        />
      )}

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 5,
          }}>Campaigns</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            <span>{campaignList.length} total</span>
            {liveCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#00D082',
                  boxShadow: '0 0 6px rgba(0,208,130,0.8)', display: 'inline-block',
                  animation: 'glow-pulse 2s infinite',
                }} />
                <span style={{ color: '#00D082', fontWeight: 600 }}>{liveCount} running</span>
              </span>
            )}
            {/* Sync status pill */}
            {syncStatus !== 'idle' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                background: syncStatus === 'saved' ? 'rgba(0,208,130,0.08)'
                  : syncStatus === 'error' ? 'rgba(255,77,109,0.08)'
                  : 'rgba(56,189,248,0.08)',
                border: `1px solid ${syncStatus === 'saved' ? 'rgba(0,208,130,0.25)'
                  : syncStatus === 'error' ? 'rgba(255,77,109,0.25)'
                  : 'rgba(56,189,248,0.25)'}`,
                color: syncStatus === 'saved' ? '#00D082'
                  : syncStatus === 'error' ? '#FF4D6D'
                  : '#38BDF8',
                transition: 'all 0.3s',
              }}>
                {syncStatus === 'syncing' && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                    style={{ animation: 'spin-cw 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                )}
                {syncStatus === 'saved' && '✓'}
                {syncStatus === 'error' && '✕'}
                {syncStatus === 'syncing' ? 'Saving…' : syncStatus === 'saved' ? 'Saved to cloud' : 'Save failed'}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(0,208,130,0.18) 0%, rgba(0,194,184,0.10) 100%)',
            border: '1px solid rgba(0,208,130,0.38)',
            color: '#00D082', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 0 20px rgba(0,208,130,0.12)', transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 28px rgba(0,208,130,0.24)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,208,130,0.12)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Campaign
        </button>
      </div>

      {/* Workspace: contacts pool (left) + input panels (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: 18, marginBottom: 28 }}>
        <ContactsPoolPanel
          contacts={contactPool}
          onRemove={removeContact}
          onEdit={setEditTarget}
          agentOptions={agentOptions}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ManualAddPanel onAdd={(c) => addContacts([c])} nextGroup={nextGroup} agentOptions={agentOptions} />
          <CSVUploadPanel onAdd={addContacts} agentOptions={agentOptions} />
        </div>
      </div>

      {/* Campaign cards */}
      {!isLoading && campaignList.length === 0 ? (
        <div style={{
          background: 'rgba(9,20,38,0.60)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
          padding: '48px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 34, marginBottom: 14 }}>📡</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No campaigns yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Add contacts using the panels above, then click &ldquo;New Campaign&rdquo; to start outreach.
          </div>
          <button onClick={() => setShowNew(true)} style={{
            background: 'linear-gradient(135deg, rgba(0,208,130,0.18) 0%, rgba(0,194,184,0.10) 100%)',
            border: '1px solid rgba(0,208,130,0.38)', borderRadius: 10,
            padding: '10px 24px', color: '#00D082', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>+ New Campaign</button>
        </div>
      ) : (
        <div>
          {campaignList.length > 0 && (
            <h2 style={{
              fontFamily: 'var(--font-syne)', fontSize: 16, fontWeight: 700,
              color: 'var(--text-primary)', marginBottom: 14, letterSpacing: '-0.01em',
            }}>Active Campaigns</h2>
          )}
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} style={{ background: 'rgba(9,20,38,0.60)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22, height: 148 }}>
                  <Sk h={12} w="55%" /><div style={{ marginTop: 12 }} /><Sk h={20} w="65%" /><div style={{ marginTop: 16 }} /><Sk h={5} r={9999} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
              {campaignList.map((c, idx) => (
                <div key={c.id} style={{ animation: `fade-in 0.5s ${idx * 60}ms both` }}>
                  <CampaignCard
                    campaign={c}
                    onAction={(action) => campaignAction.mutate(
                      { id: c.id, action },
                      {
                        onError: (err: unknown) => {
                          const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
                          setActionError({ message: msg, action });
                        },
                      }
                    )}
                    actionPending={campaignAction.isPending}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
