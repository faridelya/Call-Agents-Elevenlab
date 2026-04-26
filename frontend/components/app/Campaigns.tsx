'use client';

import { useState, useRef } from 'react';
import { useCampaigns, useCampaignAction, useCreateCampaign } from '@/lib/hooks/useCampaigns';
import { useAgents } from '@/lib/hooks/useAgents';
import type { Campaign } from '@/lib/api';

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
  first_name: string;
  last_name: string;
  product_service: string;
  group: string;
  date: string;
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

// ── New Campaign Modal (3-field popup) ─────────────────────────────────────────
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    if (!agentId) return;
    setSaving(true); setError('');
    try {
      const name = `Campaign — ${selectedGroup ? `Group ${selectedGroup}` : 'All'} — ${new Date().toLocaleDateString()}`;
      const campaign = await createCampaign.mutateAsync({ name, agent_id: agentId });

      const contactsToUpload = selectedGroup
        ? allContacts.filter((c) => c.group === selectedGroup)
        : allContacts;

      if (contactsToUpload.length > 0 && campaign?.id) {
        const csv = ['phone,first_name,last_name,product,group,date',
          ...contactsToUpload.map((c) =>
            `${c.phone},${c.first_name},${c.last_name},${c.product_service},${c.group},${c.date}`
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
        width: 440, maxWidth: '92vw',
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
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10,
                padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
                outline: 'none', cursor: 'pointer',
              }}
            >
              {agentOptions.length === 0 && <option value="">No agents available</option>}
              {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
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

// ── Manual Add Panel (right side) ─────────────────────────────────────────────
function ManualAddPanel({ onAdd, nextGroup }: { onAdd: (c: ContactEntry) => void; nextGroup: string }) {
  const [phone, setPhone]       = useState('');
  const [firstName, setFirst]   = useState('');
  const [lastName, setLast]     = useState('');
  const [product, setProduct]   = useState('');
  const [group, setGroup]       = useState('');

  function handleAdd() {
    if (!phone.trim()) return;
    onAdd({
      id: genId(),
      phone: phone.trim(), first_name: firstName.trim(),
      last_name: lastName.trim(), product_service: product.trim(),
      group: group.trim() || nextGroup, date: '',
    });
    setPhone(''); setFirst(''); setLast(''); setProduct('');
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="First Name" value={firstName} onChange={setFirst} placeholder="John" />
          <Field label="Last Name"  value={lastName}  onChange={setLast}  placeholder="Smith" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Product / Service" value={product} onChange={setProduct} placeholder="Enterprise Plan" />
          <Field label="Group" value={group} onChange={setGroup} placeholder={nextGroup} />
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

// ── CSV Upload Panel (right side) ─────────────────────────────────────────────
function CSVUploadPanel({ onAdd }: { onAdd: (cs: ContactEntry[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview]   = useState<ContactEntry[]>([]);
  const [fileName, setFileName] = useState('');
  const [err, setErr]           = useState('');

  function parse(file: File) {
    setErr(''); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) { setErr('File needs a header row and at least one data row.'); return; }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const phoneIdx = headers.indexOf('phone');
      if (phoneIdx === -1) { setErr('Missing required "phone" column.'); return; }
      const fnIdx   = headers.indexOf('first_name');
      const lnIdx   = headers.indexOf('last_name');
      const prodIdx = headers.indexOf('product');
      const grpIdx  = headers.indexOf('group');
      const dateIdx = headers.indexOf('date');

      const parsed: ContactEntry[] = [];
      for (let i = 1; i < Math.min(lines.length, 201); i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        if (!cols[phoneIdx]) continue;
        parsed.push({
          id: genId(),
          phone:           cols[phoneIdx],
          first_name:      fnIdx   >= 0 ? (cols[fnIdx]   ?? '') : '',
          last_name:       lnIdx   >= 0 ? (cols[lnIdx]   ?? '') : '',
          product_service: prodIdx >= 0 ? (cols[prodIdx] ?? '') : '',
          group:           grpIdx  >= 0 && cols[grpIdx] ? cols[grpIdx] : String(i),
          date:            dateIdx >= 0 ? (cols[dateIdx] ?? '') : '',
        });
      }
      setPreview(parsed);
    };
    reader.readAsText(file);
  }

  function confirm() { onAdd(preview); setPreview([]); setFileName(''); }
  function reset()   { setPreview([]); setFileName(''); setErr(''); }

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

      {preview.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) parse(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.09)'}`,
            borderRadius: 12, padding: '22px 16px', textAlign: 'center', cursor: 'pointer',
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
            {' '}· Optional: first_name, last_name, product, group, date
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
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#00D082' }}>{fileName}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{preview.length} contacts ready to import</div>
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
      {err && <div style={{ fontSize: 11, color: '#FF4D6D', marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// ── Contacts Pool Panel (left side) ───────────────────────────────────────────
function ContactsPoolPanel({ contacts, onRemove }: { contacts: ContactEntry[]; onRemove: (id: string) => void }) {
  const [search, setSearch]   = useState('');
  const [focused, setFocused] = useState(false);

  const filtered = contacts.filter((c) =>
    [c.phone, c.first_name, c.last_name, c.group, c.product_service].some((v) =>
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
            No contacts match "{search}"
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 100px 64px 28px',
              padding: '7px 20px', background: 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)',
            }}>
              <span>Phone</span><span>Name</span><span>Product</span><span>Group</span><span />
            </div>
            {filtered.map((c, i) => <ContactRow key={c.id} contact={c} onRemove={onRemove} striped={i % 2 === 1} />)}
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

function ContactRow({ contact: c, onRemove, striped }: { contact: ContactEntry; onRemove: (id: string) => void; striped: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 100px 64px 28px',
        padding: '8px 20px', alignItems: 'center',
        background: hov ? 'rgba(0,208,130,0.025)' : striped ? 'rgba(255,255,255,0.01)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.12s',
      }}
    >
      <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{c.phone}</span>
      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{c.first_name} {c.last_name}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.product_service || '—'}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
        background: 'rgba(56,189,248,0.08)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.15)',
        display: 'inline-block', textAlign: 'center',
      }}>{c.group || '—'}</span>
      <button onClick={() => onRemove(c.id)} style={{
        background: 'none', border: 'none',
        color: hov ? '#FF4D6D' : 'var(--text-disabled)',
        cursor: 'pointer', fontSize: 15, lineHeight: 1, transition: 'color 0.15s',
      }}>×</button>
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

// ── Campaigns View ─────────────────────────────────────────────────────────────
export function CampaignsView() {
  const { data, isLoading } = useCampaigns();
  const { data: agentsData } = useAgents();
  const campaignAction = useCampaignAction();
  const [showNew, setShowNew]       = useState(false);
  const [contactPool, setPool]      = useState<ContactEntry[]>([]);

  const campaignList  = data?.items ?? [];
  const liveCount     = campaignList.filter((c) => c.status === 'running').length;
  const agentOptions  = (agentsData?.items ?? []).map((a) => ({ id: a.id, name: a.name }));
  const contactGroups = [...new Set(contactPool.map((c) => c.group))].filter(Boolean).sort();
  const nextGroup     = contactPool.length === 0
    ? '1'
    : String(Math.max(...contactPool.map((c) => parseInt(c.group) || 0), 0) + 1);

  function addContacts(cs: ContactEntry[]) { setPool((prev) => [...prev, ...cs]); }
  function removeContact(id: string)       { setPool((prev) => prev.filter((c) => c.id !== id)); }

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

      {/* ── Workspace: contacts pool (left) + input panels (right) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 370px', gap: 18, marginBottom: 28 }}>
        <ContactsPoolPanel contacts={contactPool} onRemove={removeContact} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ManualAddPanel onAdd={(c) => addContacts([c])} nextGroup={nextGroup} />
          <CSVUploadPanel onAdd={addContacts} />
        </div>
      </div>

      {/* ── Campaign cards ── */}
      {!isLoading && campaignList.length === 0 ? (
        <div style={{
          background: 'rgba(9,20,38,0.60)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
          padding: '48px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 34, marginBottom: 14 }}>📡</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>No campaigns yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Add contacts using the panels above, then click "New Campaign" to start outreach.
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
                    onAction={(action) => campaignAction.mutate({ id: c.id, action })}
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
