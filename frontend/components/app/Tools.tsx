'use client';

import { useState, useEffect } from 'react';
import { mcpServers as mcpServersApi } from '@/lib/api';
import type { McpServer, McpServerCreate } from '@/lib/api';

// ─── ElevenLabs setup flow ────────────────────────────────────────────────────

const elvVoices = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',   desc: 'Natural Female · Conversational' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',    desc: 'Deep Male · Professional'        },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',    desc: 'Clear Male · Neutral'            },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',    desc: 'Warm Female · Friendly'          },
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Matilda', desc: 'Expressive Female · Warm'        },
];

const elvSteps = ['Connect', 'Choose Voice', 'Test', 'Done'];

function ElevenLabsSetup({ onClose }: { onClose: () => void }) {
  const [step,    setStep]   = useState(0);
  const [apiKey,  setApiKey] = useState('');
  const [agentId, setAgentId] = useState('');
  const [selVoice, setSelVoice] = useState(0);
  const [testing, setTesting]  = useState(false);
  const [done,    setDone]     = useState(false);

  const handleTest = () => {
    setTesting(true);
    setTimeout(() => { setTesting(false); setDone(true); }, 2200);
  };

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F5F3FF', border: '1px solid #EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-ui), sans-serif' }}>Connect ElevenLabs</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>AI Voice Engine · Conversational AI</div>
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      {/* Steps */}
      <StepIndicator steps={elvSteps} current={step} color="#8B5CF6" />

      {/* Content */}
      <div style={{ padding: 24 }}>
        {step === 0 && (
          <div>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 1.6 }}>
              Enter your ElevenLabs API key. Find it in your ElevenLabs dashboard under{' '}
              <span style={{ color: '#8B5CF6', fontFamily: 'var(--font-mono), monospace', fontSize: 12 }}>Profile → API Keys</span>.
            </p>
            <FieldGroup label="ElevenLabs API Key" focusColor="rgba(139,92,246,0.5)">
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                style={monoInput} onFocus={(e) => (e.target.style.borderColor = '#8B5CF6')} onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')} />
            </FieldGroup>
            <FieldGroup label={<>ElevenLabs Agent ID <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional — or create one)</span></>}>
              <input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent_xxxxxxxxxxxxxxxxx"
                style={monoInput} onFocus={(e) => (e.target.style.borderColor = '#8B5CF6')} onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')} />
            </FieldGroup>
            <div style={{ background: '#F5F3FF', border: '1px solid #EDE9FE', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#64748B', lineHeight: 1.6, marginBottom: 20 }}>
              Voxara uses <span style={{ color: '#8B5CF6' }}>ElevenLabs Conversational AI v2</span> with the Turbo model for ultra-low latency (&lt;300ms) natural voice conversations.
            </div>
            <PrimaryBtn color="#8B5CF6" onClick={() => setStep(1)}>Continue →</PrimaryBtn>
          </div>
        )}

        {step === 1 && (
          <div>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 1.6 }}>Choose a default voice for your agents. You can override this per-agent later.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {elvVoices.map((v, i) => (
                <div key={v.id} onClick={() => setSelVoice(i)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${selVoice === i ? '#8B5CF6' : '#E2E8F0'}`,
                  background: selVoice === i ? '#F5F3FF' : '#FFFFFF', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: selVoice === i ? '#EDE9FE' : '#F8FAFC',
                      border: `1px solid ${selVoice === i ? '#8B5CF6' : '#E2E8F0'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                      color: selVoice === i ? '#8B5CF6' : '#64748B',
                    }}>{v.name[0]}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selVoice === i ? '#0F172A' : '#334155' }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{v.desc}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono), monospace', color: '#94A3B8' }}>{v.id.slice(0, 8)}...</span>
                    <button style={{ fontSize: 10, fontWeight: 500, padding: '3px 9px', borderRadius: 6, background: '#F5F3FF', border: '1px solid #EDE9FE', color: '#8B5CF6', cursor: 'pointer', fontFamily: 'var(--font-ui), sans-serif' }}>▶ Play</button>
                  </div>
                </div>
              ))}
            </div>
            <PrimaryBtn color="#8B5CF6" onClick={() => setStep(2)}>Continue →</PrimaryBtn>
          </div>
        )}

        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F5F3FF', border: '1px solid #EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
            {done ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#10B981', marginBottom: 8 }}>ElevenLabs is connected!</div>
                <div style={{ fontSize: 13, color: '#64748B', marginBottom: 24, lineHeight: 1.6 }}>Voice &quot;{elvVoices[selVoice].name}&quot; is active. API key verified and agent configured.</div>
                <PrimaryBtn color="#10B981" onClick={() => setStep(3)}>Finish Setup →</PrimaryBtn>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>Test your voice connection</div>
                <div style={{ fontSize: 13, color: '#64748B', marginBottom: 24, lineHeight: 1.6 }}>
                  We&apos;ll make a short test call using <span style={{ color: '#8B5CF6' }}>{elvVoices[selVoice].name}</span> to verify your ElevenLabs integration.
                </div>
                <PrimaryBtn color="#8B5CF6" onClick={handleTest} disabled={testing}>
                  {testing ? <><Spinner /> Testing...</> : '▶ Run Test Call'}
                </PrimaryBtn>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 8, fontFamily: 'var(--font-ui), sans-serif' }}>ElevenLabs Connected</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6, lineHeight: 1.6 }}>Voice engine active · {elvVoices[selVoice].name} selected</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono), monospace', color: '#94A3B8', marginBottom: 24 }}>agent_id: {agentId || 'auto-created'}</div>
            <button onClick={onClose} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#64748B', cursor: 'pointer', fontFamily: 'var(--font-ui), sans-serif' }}>Close</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </Modal>
  );
}

// ─── Twilio setup flow ────────────────────────────────────────────────────────

const twilioSteps = ['Credentials', 'Phone Number', 'Done'];
const twilioNumbers = ['+1 (415) 555-0192', '+1 (628) 555-0147', '+1 (510) 555-0183'];

function TwilioSetup({ onClose }: { onClose: () => void }) {
  const [step, setStep]         = useState(0);
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken]   = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = () => {
    setConnecting(true);
    setTimeout(() => { setConnecting(false); setStep(2); }, 2000);
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF1F2', border: '1px solid #FECDD3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-ui), sans-serif' }}>Connect Twilio</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Telephony · PSTN · SIP</div>
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      <StepIndicator steps={twilioSteps} current={step} color="#EF4444" />

      <div style={{ padding: 24 }}>
        {step === 0 && (
          <div>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 1.6 }}>
              Connect your Twilio account to enable calling. Find these in your <span style={{ color: '#EF4444' }}>Twilio Console → Account Info</span>.
            </p>
            <FieldGroup label="Account SID">
              <input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                style={monoInput} onFocus={(e) => (e.target.style.borderColor = '#EF4444')} onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')} />
            </FieldGroup>
            <FieldGroup label="Auth Token">
              <input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="••••••••••••••••••••••••••••••••"
                style={monoInput} onFocus={(e) => (e.target.style.borderColor = '#EF4444')} onBlur={(e) => (e.target.style.borderColor = '#E2E8F0')} />
            </FieldGroup>
            <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#64748B', marginBottom: 20, lineHeight: 1.6 }}>
              Voxara stores credentials encrypted at rest. We use them only to provision numbers and route calls on your behalf.
            </div>
            <PrimaryBtn color="#EF4444" onClick={() => setStep(1)}>Continue →</PrimaryBtn>
          </div>
        )}

        {step === 1 && (
          <div>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 1.6 }}>Choose how you want to handle calls. You can provision a new Twilio number or use an existing one.</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {['Provision new number', 'Use existing number'].map((opt, i) => (
                <div key={opt} style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: `1px solid ${i === 0 ? '#FECDD3' : '#E2E8F0'}`, background: i === 0 ? '#FFF1F2' : '#FFFFFF', cursor: 'pointer', textAlign: 'center', fontSize: 12, fontWeight: 500, color: i === 0 ? '#EF4444' : '#64748B' }}>{opt}</div>
              ))}
            </div>
            <FieldGroup label="Area code (optional)">
              <input placeholder="e.g. 415" style={{ ...monoInput, fontFamily: 'var(--font-ui), sans-serif' }} />
            </FieldGroup>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 20 }}>
              {twilioNumbers.map((n, i) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: i < 2 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono), monospace', color: i === 0 ? '#0F172A' : '#64748B' }}>{n}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>Voice + SMS</span>
                    {i === 0 && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />}
                  </div>
                </div>
              ))}
            </div>
            <PrimaryBtn color="#EF4444" onClick={handleConnect} disabled={connecting}>
              {connecting ? <><Spinner /> Connecting...</> : 'Provision & Connect'}
            </PrimaryBtn>
          </div>
        )}

        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 8, fontFamily: 'var(--font-ui), sans-serif' }}>Twilio Connected</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 1.6 }}>Your workspace can now make and receive calls.</div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', marginBottom: 24, display: 'inline-block' }}>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>Provisioned number</div>
              <div style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 20, fontWeight: 600, color: '#0F172A' }}>+1 (415) 555-0192</div>
            </div>
            <br />
            <button onClick={onClose} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 28px', fontSize: 14, fontWeight: 500, color: '#64748B', cursor: 'pointer', fontFamily: 'var(--font-ui), sans-serif' }}>Done</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </Modal>
  );
}

// ─── Create MCP Server Modal ──────────────────────────────────────────────────

function CreateMcpServerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: McpServer) => void }) {
  const [name,        setName]        = useState('');
  const [url,         setUrl]         = useState('');
  const [transport,   setTransport]   = useState<'sse' | 'http'>('sse');
  const [token,       setToken]       = useState('');
  const [description, setDescription] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const focusBorder = (field: string) => focusedField === field ? '#7C6EFA' : '#E2E8F0';

  async function handleSave() {
    if (!name.trim() || !url.trim()) { setError('Server name and URL are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload: McpServerCreate = {
        name: name.trim(),
        url: url.trim(),
        transport,
        description: description.trim() || undefined,
        secret_token: token.trim() || undefined,
      };
      const created = await mcpServersApi.create(payload);
      onCreated(created);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create MCP server');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box' as const,
    background: '#F8FAFC', border: `1px solid ${focusBorder(field)}`,
    borderRadius: 8, padding: '8px 11px',
    fontSize: 12.5, color: '#0F172A', fontFamily: 'Inter, sans-serif',
    outline: 'none', transition: 'border-color 0.15s',
    boxShadow: focusedField === field ? '0 0 0 3px rgba(124,110,250,0.1)' : 'none',
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: '#64748B',
    display: 'block', marginBottom: 5,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0',
        borderRadius: 18, width: 480, maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(15,23,42,0.15)',
        overflow: 'hidden',
        animation: 'fade-in 0.2s ease-out',
      }}>
        {/* Accent bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #7C6EFA, #A89AF9, transparent)' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(124,110,250,0.1)', border: '1px solid rgba(124,110,250,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C6EFA" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Add MCP Server</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Connect an external Model Context Protocol server</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Server Name <span style={{ color: '#EF4444' }}>*</span></label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="My MCP Server"
              style={inputStyle('name')}
              onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
            />
          </div>

          <div>
            <label style={labelStyle}>Server URL <span style={{ color: '#EF4444' }}>*</span></label>
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-mcp-server.com/mcp"
              style={inputStyle('url')}
              onFocus={() => setFocusedField('url')} onBlur={() => setFocusedField(null)}
            />
          </div>

          <div>
            <label style={labelStyle}>Transport Protocol</label>
            <select
              value={transport} onChange={(e) => setTransport(e.target.value as 'sse' | 'http')}
              style={inputStyle('transport')}
              onFocus={() => setFocusedField('transport')} onBlur={() => setFocusedField(null)}
            >
              <option value="sse">SSE (Server-Sent Events)</option>
              <option value="http">HTTP Streamable</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Secret Token <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input
              type="password"
              value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="Authorization token if required"
              style={inputStyle('token')}
              onFocus={() => setFocusedField('token')} onBlur={() => setFocusedField(null)}
            />
          </div>

          <div>
            <label style={labelStyle}>Description <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this MCP server do?"
              rows={2}
              style={{ ...inputStyle('desc'), resize: 'vertical' as const, lineHeight: 1.6 }}
              onFocus={() => setFocusedField('desc')} onBlur={() => setFocusedField(null)}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#EF4444' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 9, background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSave} disabled={saving || !name.trim() || !url.trim()}
            style={{
              flex: 2, padding: '9px', borderRadius: 9,
              background: (!name.trim() || !url.trim() || saving) ? '#E2E8F0' : 'rgba(124,110,250,0.15)',
              border: `1px solid ${(!name.trim() || !url.trim() || saving) ? '#E2E8F0' : 'rgba(124,110,250,0.35)'}`,
              color: (!name.trim() || !url.trim() || saving) ? '#94A3B8' : '#7C6EFA',
              fontSize: 13, fontWeight: 600,
              cursor: (!name.trim() || !url.trim() || saving) ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {saving ? 'Adding…' : '+ Add MCP Server'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MCP Server card ──────────────────────────────────────────────────────────

function McpServerCard({ server, onDelete }: { server: McpServer; onDelete: () => void }) {
  const [hov, setHov] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try { await mcpServersApi.delete(server.id); onDelete(); }
    catch { /* ignore */ }
    finally { setDeleting(false); setConfirming(false); }
  }

  const isRegistered = !!server.el_mcp_server_id;
  const transportLabel = server.transport === 'sse' ? 'SSE' : 'HTTP';

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: '#FFFFFF', border: `1px solid ${hov ? 'rgba(124,110,250,0.28)' : '#E2E8F0'}`,
        borderRadius: 12, padding: '14px 16px',
        transition: 'all 0.2s',
        boxShadow: hov ? '0 4px 14px rgba(15,23,42,0.08)' : '0 1px 3px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>{server.name}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono), monospace' }}>
            {server.url}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
            background: 'rgba(34,211,238,0.1)', color: '#22D3EE',
            border: '1px solid rgba(34,211,238,0.25)',
          }}>{transportLabel}</span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
            background: isRegistered ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            color: isRegistered ? '#10B981' : '#F59E0B',
            border: `1px solid ${isRegistered ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
          }}>
            {isRegistered ? '● Registered' : '○ Pending EL Sync'}
          </span>
        </div>
      </div>

      {server.description && (
        <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 8, lineHeight: 1.5 }}>{server.description}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {confirming ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setConfirming(false)} style={{ fontSize: 11, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleDelete} disabled={deleting} style={{ fontSize: 11, color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
              {deleting ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            title="Delete server"
            style={{ fontSize: 16, lineHeight: 1, color: hov ? '#EF4444' : '#CBD5E1', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', transition: 'color 0.15s' }}
          >✕</button>
        )}
      </div>
    </div>
  );
}

// ─── Tools view ───────────────────────────────────────────────────────────────

const integrations = [
  { id: 'elevenlabs', name: 'ElevenLabs',    category: 'AI Voice Engine', status: 'available', color: '#8B5CF6', desc: 'Conversational AI with ultra-realistic voices',    featured: true  },
  { id: 'twilio',     name: 'Twilio',        category: 'Telephony',       status: 'connected', color: '#EF4444', desc: 'Global PSTN, SIP, and number provisioning',        featured: true  },
  { id: 'hubspot',    name: 'HubSpot CRM',   category: 'CRM',             status: 'connected', color: '#F59E0B', desc: 'Sync contact data in real time',                   featured: false },
  { id: 'shopify',    name: 'Shopify',       category: 'E-commerce',      status: 'connected', color: '#10B981', desc: 'Product catalog & order lookup',                   featured: false },
  { id: 'gcal',       name: 'Google Calendar', category: 'Scheduling',    status: 'available', color: '#06B6D4', desc: 'Book and check appointments',                      featured: false },
  { id: 'zendesk',    name: 'Zendesk',       category: 'Support',         status: 'available', color: '#8B5CF6', desc: 'Create and update support tickets',                featured: false },
  { id: 'zapier',     name: 'Zapier',        category: 'Automation',      status: 'available', color: '#F59E0B', desc: 'Connect 5,000+ apps via automation',               featured: false },
  { id: 'webhook',    name: 'Custom Webhook',category: 'Developer',       status: 'available', color: '#64748B', desc: 'Send events to any endpoint',                      featured: false },
];

export function ToolsView() {
  const [modal, setModal] = useState<string | null>(null);
  const [showMcpModal,  setShowMcpModal]  = useState(false);
  const [mcpServers,    setMcpServers]    = useState<McpServer[]>([]);
  const [mcpLoading,    setMcpLoading]    = useState(true);

  // Fetch MCP servers on mount
  useEffect(() => {
    let cancelled = false;
    setMcpLoading(true);
    mcpServersApi.list()
      .then((data) => { if (!cancelled) setMcpServers(data ?? []); })
      .catch(() => { if (!cancelled) setMcpServers([]); })
      .finally(() => { if (!cancelled) setMcpLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function handleMcpCreated(server: McpServer) {
    setMcpServers((prev) => [server, ...prev]);
  }

  function handleMcpDeleted(id: string) {
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div style={{ padding: '28px 32px', background: '#F8FAFC', minHeight: '100vh' }}>
      {modal === 'elevenlabs' && <ElevenLabsSetup onClose={() => setModal(null)} />}
      {modal === 'twilio'     && <TwilioSetup     onClose={() => setModal(null)} />}
      {showMcpModal && (
        <CreateMcpServerModal onClose={() => setShowMcpModal(false)} onCreated={handleMcpCreated} />
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-ui), sans-serif', fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 3 }}>
          Tools & Integrations
        </h1>
        <p style={{ fontSize: 12, color: '#64748B' }}>Connect data sources and services your agents use during calls</p>
      </div>

      <SectionLabel>Core Infrastructure</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {integrations.filter((t) => t.featured).map((t) => (
          <FeaturedCard key={t.id} integration={t} onManage={() => setModal(t.id)} />
        ))}
      </div>

      <SectionLabel>Additional Integrations</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
        {integrations.filter((t) => !t.featured).map((t) => (
          <SmallCard key={t.id} integration={t} />
        ))}
      </div>

      {/* ── MCP Servers ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-ui), sans-serif' }}>
              MCP Servers
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              Connect external tools via Model Context Protocol
            </div>
          </div>
          <button
            onClick={() => setShowMcpModal(true)}
            style={{
              background: 'rgba(124,110,250,0.12)', color: '#A89AF9',
              border: '1px solid rgba(124,110,250,0.25)', borderRadius: 6,
              padding: '6px 14px', fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font-ui), sans-serif',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,110,250,0.20)'; e.currentTarget.style.borderColor = 'rgba(124,110,250,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(124,110,250,0.12)'; e.currentTarget.style.borderColor = 'rgba(124,110,250,0.25)'; }}
          >
            + Add MCP Server
          </button>
        </div>

        {mcpLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', height: 80 }}>
                <div style={{ background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)', backgroundSize: '800px 100%', height: 13, borderRadius: 6, width: '45%', animation: 'shimmer 1.8s infinite linear', marginBottom: 10 }} />
                <div style={{ background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)', backgroundSize: '800px 100%', height: 11, borderRadius: 6, width: '75%', animation: 'shimmer 1.8s infinite linear' }} />
              </div>
            ))}
          </div>
        ) : mcpServers.length === 0 ? (
          <div style={{
            background: '#FFFFFF', border: '1px dashed #E2E8F0', borderRadius: 12,
            padding: '32px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🔌</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginBottom: 6 }}>No MCP servers yet</div>
            <div style={{ fontSize: 12, color: '#CBD5E1', marginBottom: 16 }}>
              Add a server to connect your agents to external tools via Model Context Protocol
            </div>
            <button
              onClick={() => setShowMcpModal(true)}
              style={{ background: 'rgba(124,110,250,0.1)', color: '#7C6EFA', border: '1px solid rgba(124,110,250,0.25)', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              + Add First MCP Server
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {mcpServers.map((s) => (
              <McpServerCard key={s.id} server={s} onDelete={() => handleMcpDeleted(s.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function FeaturedCard({ integration: t, onManage }: { integration: typeof integrations[number]; onManage: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${hov ? `${t.color}50` : '#E2E8F0'}`,
        borderRadius: 14, padding: 20, display: 'flex', gap: 16, alignItems: 'flex-start', cursor: 'pointer', transition: 'all 0.2s',
        boxShadow: hov ? '0 8px 25px rgba(15,23,42,0.10)' : '0 1px 3px rgba(15,23,42,0.06)',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${t.color}14`, border: `1px solid ${t.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {t.id === 'elevenlabs' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="2" strokeLinecap="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-ui), sans-serif' }}>{t.name}</div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: t.status === 'connected' ? '#ECFDF5' : '#F8FAFC', color: t.status === 'connected' ? '#10B981' : '#64748B', border: `1px solid ${t.status === 'connected' ? '#A7F3D0' : '#E2E8F0'}` }}>
            {t.status === 'connected' ? '● Connected' : 'Not connected'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: `${t.color}99`, marginBottom: 6, fontWeight: 500 }}>{t.category}</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 1.5 }}>{t.desc}</div>
        <button onClick={onManage}
          onMouseEnter={(e) => (e.currentTarget.style.background = `${t.color}28`)}
          onMouseLeave={(e) => (e.currentTarget.style.background = `${t.color}14`)}
          style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, background: `${t.color}14`, border: `1px solid ${t.color}30`, color: t.color, cursor: 'pointer', fontFamily: 'var(--font-ui), sans-serif', transition: 'all 0.15s' }}>
          {t.status === 'connected' ? 'Manage →' : 'Connect →'}
        </button>
      </div>
    </div>
  );
}

function SmallCard({ integration: t }: { integration: typeof integrations[number] }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: '#FFFFFF', border: `1px solid ${hov ? `${t.color}35` : '#E2E8F0'}`, borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'all 0.2s', boxShadow: hov ? '0 4px 12px rgba(15,23,42,0.08)' : '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${t.color}14`, border: `1px solid ${t.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: t.color, opacity: 0.8 }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999, background: t.status === 'connected' ? '#ECFDF5' : '#F8FAFC', color: t.status === 'connected' ? '#10B981' : '#64748B', border: `1px solid ${t.status === 'connected' ? '#A7F3D0' : '#E2E8F0'}` }}>
          {t.status === 'connected' ? 'Connected' : 'Available'}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>{t.name}</div>
      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>{t.category}</div>
      <button style={{ fontSize: 11, fontWeight: 500, color: t.color, background: `${t.color}10`, border: `1px solid ${t.color}20`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-ui), sans-serif' }}>
        {t.status === 'connected' ? 'Manage' : 'Connect →'}
      </button>
    </div>
  );
}

// ─── Shared mini components ───────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'none', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 20, width: 520, boxShadow: '0 20px 60px rgba(15,23,42,0.15), 0 8px 20px rgba(15,23,42,0.08)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 20, lineHeight: 1 }}>×</button>
  );
}

function StepIndicator({ steps, current, color }: { steps: string[]; current: number; color: string }) {
  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 0, background: '#F8FAFC' }}>
      {steps.map((s, i) => (
        <span key={s} style={{ display: 'contents' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: i <= current ? color : '#E2E8F0', border: `1px solid ${i <= current ? color : '#CBD5E1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i <= current ? '#fff' : '#94A3B8', transition: 'all 0.3s' }}>
              {i < current ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : i + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: i === current ? '#0F172A' : '#94A3B8' }}>{s}</span>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: i < current ? `${color}40` : '#E2E8F0', margin: '0 8px', minWidth: 20, transition: 'background 0.3s' }} />}
        </span>
      ))}
    </div>
  );
}

function FieldGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode; focusColor?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const monoInput: React.CSSProperties = {
  width: '100%',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: '#0F172A',
  fontFamily: 'var(--font-mono), monospace',
  outline: 'none',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box',
};

function PrimaryBtn({ color, onClick, disabled, children }: { color: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        background: disabled ? `${color}4d` : color,
        border: 'none',
        borderRadius: 10,
        padding: 11,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        cursor: disabled ? 'wait' : 'pointer',
        fontFamily: 'var(--font-ui), sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  );
}
