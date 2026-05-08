'use client';

import { useState } from 'react';

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

  return (
    <div style={{ padding: '28px 32px', background: '#F8FAFC', minHeight: '100vh' }}>
      {modal === 'elevenlabs' && <ElevenLabsSetup onClose={() => setModal(null)} />}
      {modal === 'twilio'     && <TwilioSetup     onClose={() => setModal(null)} />}

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {integrations.filter((t) => !t.featured).map((t) => (
          <SmallCard key={t.id} integration={t} />
        ))}
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
