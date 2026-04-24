'use client';

import { useState, useEffect } from 'react';
import { useAgent, useCreateAgent, useUpdateAgent, useSyncAgent, useVoices } from '@/lib/hooks/useAgents';
import type { AgentCreate } from '@/lib/api';
import { TestCallPanel } from './TestCallPanel';

// ─── Constants ────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'config',    label: 'Config',    icon: 'M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2z' },
  { id: 'tools',     label: 'Tools',     icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { id: 'voice',     label: 'Voice',     icon: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2' },
  { id: 'script',    label: 'Script',    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { id: 'advanced',  label: 'Advanced',  icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
  { id: 'test',      label: 'Test Call', icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z' },
];

const LLM_MODELS = [
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Fastest · Recommended', provider: 'Google', color: '#4285F4' },
  { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   desc: 'More capable · Slower',  provider: 'Google', color: '#4285F4' },
  { id: 'gpt-4o-mini',      label: 'GPT-4o Mini',       desc: 'OpenAI · Fast',          provider: 'OpenAI', color: '#10A37F' },
  { id: 'gpt-4o',           label: 'GPT-4o',            desc: 'OpenAI · Best quality',  provider: 'OpenAI', color: '#10A37F' },
  { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku',  desc: 'Anthropic · Fast',       provider: 'Anthropic', color: '#E6742A' },
];

export const BUILTIN_TOOLS: Array<{
  id: string; name: string; desc: string; color: string; tier: 1 | 2; configurable: boolean;
}> = [
  { id: 'save_lead',          name: 'Save Lead',           desc: 'Capture contact info during call',       color: '#7C6EFA', tier: 1, configurable: false },
  { id: 'get_contact_info',   name: 'Get Contact',         desc: 'Fetch existing lead before call',        color: '#22D3EE', tier: 1, configurable: false },
  { id: 'end_call',           name: 'End Call',            desc: 'Terminate call with outcome',            color: '#EF4444', tier: 1, configurable: false },
  { id: 'log_call_outcome',   name: 'Log Outcome',         desc: 'Record result and next action',          color: '#10B981', tier: 1, configurable: false },
  { id: 'get_call_script',    name: 'Get Script',          desc: 'Fetch script section on demand',         color: '#A89AF9', tier: 1, configurable: false },
  { id: 'update_call_stage',  name: 'Update Stage',        desc: 'Track call stage for analytics',         color: '#64748B', tier: 1, configurable: false },
  { id: 'book_meeting',       name: 'Book Meeting',        desc: 'Schedule via calendar integration',      color: '#F59E0B', tier: 2, configurable: true },
  { id: 'send_followup_sms',  name: 'Send Follow-up SMS',  desc: 'Send SMS message after call',            color: '#22D3EE', tier: 2, configurable: true },
  { id: 'qualify_lead',       name: 'Qualify Lead',        desc: 'Score lead against your criteria',       color: '#A89AF9', tier: 2, configurable: false },
  { id: 'lookup_product_info',name: 'Product Info Lookup', desc: 'Answer questions from product catalog',  color: '#10B981', tier: 2, configurable: false },
  { id: 'check_crm_record',   name: 'CRM Lookup',          desc: 'Fetch contact from HubSpot/Salesforce',  color: '#F59E0B', tier: 2, configurable: true },
  { id: 'update_crm_record',  name: 'CRM Update',          desc: 'Push outcome + notes to CRM',            color: '#10B981', tier: 2, configurable: true },
  { id: 'transfer_to_human',  name: 'Transfer to Human',   desc: 'Warm/cold transfer via conference',      color: '#EF4444', tier: 2, configurable: true },
  { id: 'leave_voicemail',    name: 'Leave Voicemail',     desc: 'Play recorded voicemail, end call',      color: '#64748B', tier: 2, configurable: true },
];

export const TIER1_IDS = new Set(BUILTIN_TOOLS.filter((t) => t.tier === 1).map((t) => t.id));

const DEFAULT_TOOL_CONFIGS: Record<string, Record<string, string>> = {
  book_meeting:       { calendar_provider: 'cal.com', api_key: '', calendar_id: '' },
  send_followup_sms:  { message_template: "Hi {{lead_first_name}}, thanks for chatting! We'll follow up shortly." },
  check_crm_record:   { provider: 'hubspot', api_key: '' },
  update_crm_record:  { provider: 'hubspot', api_key: '' },
  transfer_to_human:  { transfer_to: '', mode: 'warm' },
  leave_voicemail:    { default_message: "Hi, this is {{company_name}}. Sorry we missed you — we'll try again soon!" },
};

// Popular ElevenLabs pre-made voices — always available on any EL account
const POPULAR_VOICES: Array<{ voice_id: string; name: string; gender: string; accent: string }> = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',   gender: 'Female', accent: 'American'   },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',     gender: 'Female', accent: 'American'   },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',    gender: 'Female', accent: 'American'   },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni',   gender: 'Male',   accent: 'American'   },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',     gender: 'Female', accent: 'American'   },
  { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',     gender: 'Male',   accent: 'American'   },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',   gender: 'Male',   accent: 'American'   },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',     gender: 'Male',   accent: 'American'   },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',      gender: 'Male',   accent: 'American'   },
  { voice_id: 'CYw3kZ38HenStdEgyMUi', name: 'Dave',     gender: 'Male',   accent: 'British'    },
  { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie',  gender: 'Male',   accent: 'Australian' },
  { voice_id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily',    gender: 'Female', accent: 'American'   },
  { voice_id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',   gender: 'Male',   accent: 'American'   },
  { voice_id: 'ODq5zmih8GrVes37Dy38', name: 'Patrick',  gender: 'Male',   accent: 'American'   },
  { voice_id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry',    gender: 'Male',   accent: 'American'   },
  { voice_id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy',  gender: 'Female', accent: 'British'    },
  { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',     gender: 'Male',   accent: 'American'   },
  { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte',gender: 'Female', accent: 'British'    },
  { voice_id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',    gender: 'Female', accent: 'British'    },
  { voice_id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',    gender: 'Male',   accent: 'American'   },
];

const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },  { code: 'pt', label: 'Portuguese' }, { code: 'it', label: 'Italian' },
  { code: 'pl', label: 'Polish' },  { code: 'hi', label: 'Hindi' }, { code: 'ar', label: 'Arabic' },
  { code: 'ja', label: 'Japanese' },{ code: 'zh', label: 'Chinese' },
];

// ─── Styled field components ──────────────────────────────────────────────────

const baseField: React.CSSProperties = {
  background: '#080B14', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9,
  padding: '9px 12px', fontSize: 13, color: '#CBD5E1',
  fontFamily: 'var(--font-inter), sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

function FInput({ style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{ ...baseField, ...style, borderColor: focused ? 'rgba(124,110,250,0.5)' : 'rgba(255,255,255,0.09)', boxShadow: focused ? '0 0 0 3px rgba(124,110,250,0.07)' : 'none' }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function FSelect({ style, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...props}
      style={{ ...baseField, ...style, borderColor: focused ? 'rgba(124,110,250,0.5)' : 'rgba(255,255,255,0.09)' }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {children}
    </select>
  );
}

function FTextarea({ style, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{ ...baseField, ...style, resize: 'vertical', lineHeight: 1.65, borderColor: focused ? 'rgba(124,110,250,0.5)' : 'rgba(255,255,255,0.09)', boxShadow: focused ? '0 0 0 3px rgba(124,110,250,0.07)' : 'none' }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function Label({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7, letterSpacing: '0.02em', fontFamily: 'var(--font-inter), sans-serif' }}>
      {icon && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d={icon} />
        </svg>
      )}
      {children}
    </label>
  );
}

function Field({ children, span }: { children: React.ReactNode; span?: boolean }) {
  return <div style={{ gridColumn: span ? '1/-1' : undefined }}>{children}</div>;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  const isOk = type === 'success';
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 999,
      background: isOk ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${isOk ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
      borderRadius: 12, padding: '12px 20px', fontSize: 13, fontWeight: 600,
      color: isOk ? '#10B981' : '#EF4444',
      boxShadow: `0 8px 32px ${isOk ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}`,
      fontFamily: 'var(--font-inter), sans-serif',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 15 }}>{isOk ? '✓' : '✕'}</span>
      {msg}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', marginBottom: 12, fontFamily: 'var(--font-inter), sans-serif' }}>{title}</div>
      <div style={{ background: '#0A0F1E', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 18px' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentBuilder({ agentId, onBack }: { agentId: string | null; onBack: () => void }) {
  const isNew = !agentId;

  const { data: existing, isLoading } = useAgent(agentId);
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent(agentId ?? '');
  const syncAgent   = useSyncAgent();
  const { data: voicesData } = useVoices();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [tab,           setTab]           = useState('config');
  const [agentName,     setAgentName]     = useState('New Agent');
  const [description,   setDescription]   = useState('');
  const [callType,      setCallType]      = useState<'outbound' | 'inbound'>('outbound');
  const [language,      setLanguage]      = useState('en');
  const [systemPrompt,  setSystemPrompt]  = useState('You are a friendly AI voice agent. Your goal is to qualify leads and schedule demos. Keep calls under 3 minutes. Always be professional and helpful.');
  const [firstMessage,  setFirstMessage]  = useState('Hi {{lead_first_name}}, this is calling from {{company_name}}. Do you have a minute?');
  const [companyName,   setCompanyName]   = useState('');
  const [productName,   setProductName]   = useState('');
  const [enabledTools,  setEnabledTools]  = useState<string[]>([...TIER1_IDS]);
  const [toolConfigs,   setToolConfigs]   = useState<Record<string, Record<string, string>>>({ ...DEFAULT_TOOL_CONFIGS });
  const [selectedVoice, setSelectedVoice] = useState(0);
  const [scriptOpener,     setScriptOpener]     = useState('');
  const [scriptDiscovery,  setScriptDiscovery]  = useState('');
  const [scriptPitch,      setScriptPitch]      = useState('');
  const [scriptObjection,  setScriptObjection]  = useState('');
  const [scriptClosing,    setScriptClosing]    = useState('');
  const [scriptFaq,        setScriptFaq]        = useState('');
  const [maxDuration,    setMaxDuration]    = useState(300);
  const [silenceTimeout, setSilenceTimeout] = useState(10);
  const [llmModel,       setLlmModel]       = useState('gemini-1.5-flash');
  const [temperature,    setTemperature]    = useState(0.7);
  const [stability,      setStability]      = useState(0.5);
  const [similarity,     setSimilarity]     = useState(0.75);
  const [isSaving,  setIsSaving]  = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!existing) return;
    setAgentName(existing.name);
    setDescription(existing.description ?? '');
    setCallType(existing.call_type === 'inbound' ? 'inbound' : 'outbound');
    setLanguage(existing.language ?? 'en');
    setSystemPrompt(existing.system_prompt ?? '');
    setFirstMessage(existing.first_message ?? '');
    setCompanyName(existing.company_name ?? '');
    setProductName(existing.product_name ?? '');
    const tools = existing.enabled_tools ?? [];
    setEnabledTools([...new Set([...TIER1_IDS, ...tools])]);
    const savedCfg = (existing.tool_configs as Record<string, Record<string, string>>) ?? {};
    setToolConfigs({ ...DEFAULT_TOOL_CONFIGS, ...savedCfg });
    setMaxDuration(existing.max_call_duration_seconds ?? 300);
    setSilenceTimeout(existing.silence_timeout_seconds ?? 10);
    setLlmModel(existing.llm_model ?? 'gemini-1.5-flash');
    setTemperature(existing.llm_temperature ?? 0.7);
    setStability(existing.voice_stability ?? 0.5);
    setSimilarity(existing.voice_similarity ?? 0.75);
    const cs = existing.call_script ?? {};
    setScriptOpener(cs.opener ?? '');
    setScriptDiscovery(cs.discovery ?? '');
    setScriptPitch(cs.pitch ?? '');
    setScriptObjection(cs.objection_handling ?? '');
    setScriptClosing(cs.closing ?? '');
    setScriptFaq(cs.faq ?? '');
    if (voicesData) {
      const lib = voicesData;
      const libIds = new Set(lib.map((v) => v.voice_id));
      const merged = [...lib, ...POPULAR_VOICES.filter((v) => !libIds.has(v.voice_id))];
      const idx = merged.findIndex((v) => v.voice_id === existing.voice_id);
      if (idx >= 0) setSelectedVoice(idx);
    }
  }, [existing, voicesData]);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }

  const voices = voicesData ?? [];
  // Build the same merged list as VoiceTab so selectedVoice index resolves correctly
  const libraryIds = new Set(voices.map((v) => v.voice_id));
  const mergedVoices = [
    ...voices,
    ...POPULAR_VOICES.filter((v) => !libraryIds.has(v.voice_id)),
  ];
  const voiceId = mergedVoices[selectedVoice]?.voice_id ?? '';

  function buildBody(): AgentCreate {
    const relevantConfigs: Record<string, Record<string, string>> = {};
    for (const toolId of enabledTools) {
      if (toolConfigs[toolId]) relevantConfigs[toolId] = toolConfigs[toolId];
    }
    return {
      name: agentName, description, call_type: callType, voice_id: voiceId || 'default',
      language, system_prompt: systemPrompt, first_message: firstMessage,
      company_name: companyName, product_name: productName,
      max_call_duration_seconds: maxDuration, silence_timeout_seconds: silenceTimeout,
      llm_model: llmModel, llm_temperature: temperature,
      voice_stability: stability, voice_similarity: similarity,
      enabled_tools: enabledTools, tool_configs: relevantConfigs as Record<string, unknown>,
      call_script: { opener: scriptOpener || undefined, discovery: scriptDiscovery || undefined, pitch: scriptPitch || undefined, objection_handling: scriptObjection || undefined, closing: scriptClosing || undefined, faq: scriptFaq || undefined },
    };
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      if (isNew) { await createAgent.mutateAsync(buildBody()); showToast('Agent created!', 'success'); }
      else { await updateAgent.mutateAsync(buildBody()); showToast('Agent saved!', 'success'); }
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Save failed', 'error'); }
    finally { setIsSaving(false); }
  }

  async function handleSync() {
    if (!agentId) return;
    setIsSyncing(true);
    try { await syncAgent.mutateAsync(agentId); showToast('Synced to ElevenLabs ✓', 'success'); }
    catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Sync failed', 'error'); }
    finally { setIsSyncing(false); }
  }

  if (isLoading && !isNew) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#334155', fontSize: 13, fontFamily: 'var(--font-inter)' }}>Loading agent…</div>;
  }

  const hasEL = !!existing?.elevenlabs_agent_id;
  const synced = hasEL && !!existing?.el_last_synced_at;
  const tier2Active = enabledTools.filter((id) => !TIER1_IDS.has(id)).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {toast && <Toast {...toast} />}
      <style>{`
        @keyframes tab-enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0C1120', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: 'var(--font-inter)', padding: '5px 10px', borderRadius: 7, transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)' }} />
          <input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            style={{ background: 'transparent', border: 'none', fontFamily: 'var(--font-syne), sans-serif', fontSize: 17, fontWeight: 700, color: '#F1F5F9', outline: 'none', letterSpacing: '-0.02em', width: 280 }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {synced ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', fontSize: 11, fontWeight: 600, color: '#10B981', fontFamily: 'var(--font-inter)' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981' }} />
              EL Synced
            </span>
          ) : (
            <span style={{ padding: '4px 10px', borderRadius: 9999, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 11, fontWeight: 600, color: '#F59E0B', fontFamily: 'var(--font-inter)' }}>
              {isNew ? 'New' : 'Not synced'}
            </span>
          )}

          <button onClick={handleSave} disabled={isSaving} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 16px', fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 500, color: '#94A3B8', cursor: 'pointer', opacity: isSaving ? 0.5 : 1, transition: 'all 0.15s' }}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>

          {!isNew && (
            <button onClick={handleSync} disabled={isSyncing} style={{ background: isSyncing ? 'rgba(124,110,250,0.5)' : '#7C6EFA', border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s', boxShadow: isSyncing ? 'none' : '0 0 16px rgba(124,110,250,0.3)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              {isSyncing ? 'Syncing…' : 'Go Live'}
            </button>
          )}
          {isNew && (
            <button onClick={handleSave} disabled={isSaving} style={{ background: '#7C6EFA', border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: isSaving ? 0.5 : 1, boxShadow: '0 0 16px rgba(124,110,250,0.3)', transition: 'all 0.15s' }}>
              Create Agent
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 0, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0C1120', flexShrink: 0 }}>
        {tabs.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '12px 14px',
                fontSize: 12, fontWeight: isActive ? 600 : 500,
                color: isActive ? '#E2E8F0' : '#475569',
                fontFamily: 'var(--font-inter)',
                borderBottom: `2px solid ${isActive ? '#7C6EFA' : 'transparent'}`,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#94A3B8'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#475569'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: isActive ? 1 : 0.5 }}>
                <path d={t.icon} />
              </svg>
              {t.label}
              {t.id === 'tools' && tier2Active > 0 && (
                <span style={{ background: '#7C6EFA', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 9999 }}>{tier2Active}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: tab === 'test' ? 'hidden' : 'auto', padding: tab === 'test' ? 0 : '24px 28px' }}>
        {tab === 'config'   && <ConfigTab callType={callType} setCallType={setCallType} language={language} setLanguage={setLanguage} systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt} firstMessage={firstMessage} setFirstMessage={setFirstMessage} companyName={companyName} setCompanyName={setCompanyName} productName={productName} setProductName={setProductName} description={description} setDescription={setDescription} />}
        {tab === 'tools'    && <ToolsTab enabledTools={enabledTools} setEnabledTools={setEnabledTools} toolConfigs={toolConfigs} setToolConfigs={setToolConfigs} />}
        {tab === 'voice'    && <VoiceTab voices={voices} selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice} stability={stability} setStability={setStability} similarity={similarity} setSimilarity={setSimilarity} />}
        {tab === 'script'   && <ScriptTab opener={scriptOpener} setOpener={setScriptOpener} discovery={scriptDiscovery} setDiscovery={setScriptDiscovery} pitch={scriptPitch} setPitch={setScriptPitch} objection={scriptObjection} setObjection={setScriptObjection} closing={scriptClosing} setClosing={setScriptClosing} faq={scriptFaq} setFaq={setScriptFaq} />}
        {tab === 'advanced' && <AdvancedTab maxDuration={maxDuration} setMaxDuration={setMaxDuration} silenceTimeout={silenceTimeout} setSilenceTimeout={setSilenceTimeout} llmModel={llmModel} setLlmModel={setLlmModel} temperature={temperature} setTemperature={setTemperature} />}
        {tab === 'test'     && <TestCallPanel agentId={agentId} agentName={agentName} isSynced={synced} />}
      </div>
    </div>
  );
}

// ─── Config tab ───────────────────────────────────────────────────────────────

function ConfigTab({ callType, setCallType, language, setLanguage, systemPrompt, setSystemPrompt, firstMessage, setFirstMessage, companyName, setCompanyName, productName, setProductName, description, setDescription }: {
  callType: string; setCallType: (t: 'outbound' | 'inbound') => void;
  language: string; setLanguage: (l: string) => void;
  systemPrompt: string; setSystemPrompt: (v: string) => void;
  firstMessage: string; setFirstMessage: (v: string) => void;
  companyName: string; setCompanyName: (v: string) => void;
  productName: string; setProductName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
}) {
  return (
    <div style={{ maxWidth: 920 }}>
      <SectionCard title="Agent Identity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <Label icon="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07">Agent type</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['outbound', 'inbound'] as const).map((t) => (
                <button key={t} onClick={() => setCallType(t)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${callType === t ? 'rgba(124,110,250,0.45)' : 'rgba(255,255,255,0.08)'}`, background: callType === t ? 'rgba(124,110,250,0.12)' : '#080B14', color: callType === t ? '#A89AF9' : '#64748B', fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label icon="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z">Language</Label>
            <FSelect value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </FSelect>
          </div>
          <div>
            <Label>Company name</Label>
            <FInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div>
            <Label>Product / service</Label>
            <FInput value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Voxara AI Platform" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Label>Description (internal)</Label>
            <FInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief internal description of this agent's purpose" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Personality & Goals">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <Label>System prompt <span style={{ color: '#334155', fontWeight: 400, fontSize: 10 }}>— agent's personality and goal</span></Label>
            <FTextarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={6} />
            <div style={{ fontSize: 10, color: '#334155', marginTop: 5, fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{systemPrompt.length} chars</div>
          </div>
          <div>
            <Label>First message <span style={{ color: '#334155', fontWeight: 400, fontSize: 10 }}>— {'{{lead_first_name}}'}, {'{{company_name}}'}, {'{{product_name}}'}</span></Label>
            <FTextarea value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} rows={3} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tools tab ────────────────────────────────────────────────────────────────

function ToolsTab({ enabledTools, setEnabledTools, toolConfigs, setToolConfigs }: {
  enabledTools: string[]; setEnabledTools: (t: string[]) => void;
  toolConfigs: Record<string, Record<string, string>>; setToolConfigs: (c: Record<string, Record<string, string>>) => void;
}) {
  const toggle = (id: string) => {
    if (TIER1_IDS.has(id)) return;
    setEnabledTools(enabledTools.includes(id) ? enabledTools.filter((t) => t !== id) : [...enabledTools, id]);
  };

  const updateConfig = (toolId: string, key: string, value: string) => {
    const updated = { ...toolConfigs, [toolId]: { ...toolConfigs[toolId], [key]: value } };
    if (toolId === 'check_crm_record' || toolId === 'update_crm_record') {
      const partner = toolId === 'check_crm_record' ? 'update_crm_record' : 'check_crm_record';
      updated[partner] = { ...updated[partner], [key]: value };
    }
    setToolConfigs(updated);
  };

  const tier1 = BUILTIN_TOOLS.filter((t) => t.tier === 1);
  const tier2 = BUILTIN_TOOLS.filter((t) => t.tier === 2);
  const enabledTier2 = tier2.filter((t) => enabledTools.includes(t.id) && t.configurable).filter((t) => {
    if (t.id === 'update_crm_record' && enabledTools.includes('check_crm_record')) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'rgba(124,110,250,0.05)', border: '1px solid rgba(124,110,250,0.12)', borderRadius: 10, marginBottom: 24, fontSize: 12, color: '#64748B', lineHeight: 1.55, fontFamily: 'var(--font-inter)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C6EFA" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span><strong style={{ color: '#A89AF9' }}>Tier 1 tools</strong> run inside the bridge — zero latency, always active. <strong style={{ color: '#A89AF9' }}>Tier 2 tools</strong> are optional and require credentials.</span>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', marginBottom: 10, fontFamily: 'var(--font-inter)' }}>Tier 1 — Always Active</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 28 }}>
        {tier1.map((tool) => <ToolCard key={tool.id} tool={tool} active={true} locked={true} onToggle={() => {}} />)}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', marginBottom: 10, fontFamily: 'var(--font-inter)' }}>Tier 2 — Optional Tools</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
        {tier2.map((tool) => <ToolCard key={tool.id} tool={tool} active={enabledTools.includes(tool.id)} locked={false} onToggle={() => toggle(tool.id)} />)}
      </div>

      {enabledTier2.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', marginBottom: 14, fontFamily: 'var(--font-inter)' }}>Tool Configuration</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {enabledTier2.map((tool) => (
              <ToolConfigPanel key={tool.id} tool={tool} config={toolConfigs[tool.id] ?? {}} onChange={(key, val) => updateConfig(tool.id, key, val)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool, active, locked, onToggle }: { tool: typeof BUILTIN_TOOLS[number]; active: boolean; locked: boolean; onToggle: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => !locked && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#0A0F1E',
        border: `1px solid ${active ? `${tool.color}28` : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `3px solid ${active ? tool.color : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 10, padding: '12px 14px',
        cursor: locked ? 'default' : 'pointer',
        transition: 'all 0.18s',
        boxShadow: hov && !locked ? `0 0 18px ${tool.color}1A` : 'none',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: tool.color, flexShrink: 0, marginTop: 5, opacity: active ? 1 : 0.25 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: active ? '#E2E8F0' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-inter)' }}>{tool.name}</div>
          {locked ? (
            <span style={{ fontSize: 8, fontWeight: 800, color: tool.color, background: `${tool.color}14`, padding: '2px 6px', borderRadius: 9999, flexShrink: 0, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-inter)' }}>Core</span>
          ) : (
            <div style={{ width: 28, height: 15, borderRadius: 9999, background: active ? '#7C6EFA' : 'rgba(255,255,255,0.08)', transition: 'background 0.25s', flexShrink: 0, position: 'relative', boxShadow: active ? '0 0 10px rgba(124,110,250,0.4)' : 'none' }}>
              <div style={{ position: 'absolute', top: 2.5, left: active ? 15 : 2.5, width: 10, height: 10, borderRadius: '50%', background: '#fff', transition: 'left 0.25s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#334155', lineHeight: 1.45, fontFamily: 'var(--font-inter)' }}>{tool.desc}</div>
        {!locked && tool.configurable && active && (
          <div style={{ fontSize: 9, color: '#7C6EFA', marginTop: 4, fontWeight: 600, fontFamily: 'var(--font-inter)', letterSpacing: '0.04em' }}>Configure below ↓</div>
        )}
      </div>
    </div>
  );
}

function ToolConfigPanel({ tool, config, onChange }: { tool: typeof BUILTIN_TOOLS[number]; config: Record<string, string>; onChange: (key: string, val: string) => void }) {
  return (
    <div style={{ background: '#0A0F1E', border: `1px solid ${tool.color}20`, borderLeft: `3px solid ${tool.color}`, borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: tool.color }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', fontFamily: 'var(--font-inter)' }}>{tool.name}</span>
      </div>

      {tool.id === 'book_meeting' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Label>Calendar provider</Label><FSelect value={config.calendar_provider ?? 'cal.com'} onChange={(e) => onChange('calendar_provider', e.target.value)}><option value="cal.com">Cal.com</option><option value="google_calendar">Google Calendar</option><option value="calendly">Calendly</option></FSelect></div>
          <div><Label>Calendar ID / username</Label><FInput value={config.calendar_id ?? ''} onChange={(e) => onChange('calendar_id', e.target.value)} placeholder="your-username" /></div>
          <div style={{ gridColumn: '1/-1' }}><Label>API key</Label><FInput type="password" value={config.api_key ?? ''} onChange={(e) => onChange('api_key', e.target.value)} placeholder="cal_xxxxxxxxxx" /></div>
        </div>
      )}
      {tool.id === 'send_followup_sms' && (
        <div>
          <Label>Default message template <span style={{ color: '#334155', fontWeight: 400 }}>— {'{{lead_first_name}}'}, {'{{company_name}}'}</span></Label>
          <FTextarea value={config.message_template ?? ''} onChange={(e) => onChange('message_template', e.target.value)} rows={3} placeholder="Hi {{lead_first_name}}, thanks for chatting!" />
          <div style={{ fontSize: 10, color: '#334155', marginTop: 4, fontFamily: 'var(--font-jetbrains-mono)' }}>{(config.message_template ?? '').length}/160 chars</div>
        </div>
      )}
      {(tool.id === 'check_crm_record' || tool.id === 'update_crm_record') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Label>CRM provider</Label><FSelect value={config.provider ?? 'hubspot'} onChange={(e) => onChange('provider', e.target.value)}><option value="hubspot">HubSpot</option><option value="salesforce">Salesforce</option></FSelect></div>
          <div><Label>API key / access token</Label><FInput type="password" value={config.api_key ?? ''} onChange={(e) => onChange('api_key', e.target.value)} placeholder="pat-na1-xxxxxxxxxx" /></div>
          <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#475569', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.05)', fontFamily: 'var(--font-inter)' }}>
            CRM Lookup and CRM Update share the same credentials.
          </div>
        </div>
      )}
      {tool.id === 'transfer_to_human' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Label>Transfer-to number (E.164)</Label><FInput value={config.transfer_to ?? ''} onChange={(e) => onChange('transfer_to', e.target.value)} placeholder="+15551234567" /></div>
          <div>
            <Label>Transfer mode</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['warm', 'cold'] as const).map((m) => (
                <button key={m} onClick={() => onChange('mode', m)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${(config.mode ?? 'warm') === m ? 'rgba(124,110,250,0.45)' : 'rgba(255,255,255,0.08)'}`, background: (config.mode ?? 'warm') === m ? 'rgba(124,110,250,0.12)' : '#080B14', color: (config.mode ?? 'warm') === m ? '#A89AF9' : '#64748B', fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s' }}>{m}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {tool.id === 'leave_voicemail' && (
        <div>
          <Label>Default voicemail message</Label>
          <FTextarea value={config.default_message ?? ''} onChange={(e) => onChange('default_message', e.target.value)} rows={3} placeholder="Hi, this is {{company_name}}. Sorry we missed you!" />
        </div>
      )}
    </div>
  );
}

// ─── Voice tab ────────────────────────────────────────────────────────────────

function VoiceTab({ voices, selectedVoice, setSelectedVoice, stability, setStability, similarity, setSimilarity }: {
  voices: Array<{ voice_id: string; name: string }>; selectedVoice: number; setSelectedVoice: (i: number) => void;
  stability: number; setStability: (v: number) => void; similarity: number; setSimilarity: (v: number) => void;
}) {
  const [customId, setCustomId] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');

  // Build merged list: EL API library voices first (deduplicated), then popular preset voices
  const libraryIds = new Set(voices.map((v) => v.voice_id));
  const presets = POPULAR_VOICES.filter((v) => !libraryIds.has(v.voice_id));

  type VoiceEntry = { voice_id: string; name: string; gender?: string; accent?: string; source: 'library' | 'preset' };
  const allVoices: VoiceEntry[] = [
    ...voices.map((v) => ({ ...v, source: 'library' as const })),
    ...presets.map((v) => ({ ...v, source: 'preset' as const })),
  ];

  const filtered = allVoices.filter((v) => {
    if (genderFilter === 'all') return true;
    return (v.gender ?? '').toLowerCase() === genderFilter;
  });

  return (
    <div style={{ maxWidth: 700 }}>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', fontFamily: 'var(--font-inter)', whiteSpace: 'nowrap' }}>
          Filter
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {(['all', 'female', 'male'] as const).map((g) => (
            <button key={g} onClick={() => setGenderFilter(g)} style={{
              padding: '4px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-inter)', transition: 'all 0.15s', textTransform: 'capitalize',
              border: `1px solid ${genderFilter === g ? 'rgba(124,110,250,0.45)' : 'rgba(255,255,255,0.08)'}`,
              background: genderFilter === g ? 'rgba(124,110,250,0.14)' : 'transparent',
              color: genderFilter === g ? '#A89AF9' : '#475569',
            }}>
              {g === 'all' ? 'All' : g === 'female' ? '♀ Female' : '♂ Male'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: '#334155', fontFamily: 'var(--font-inter)', marginLeft: 'auto' }}>
          {filtered.length} voices
          {voices.length > 0 && <span style={{ color: '#7C6EFA', marginLeft: 6 }}>· {voices.length} from your EL library</span>}
        </span>
      </div>

      {/* ── Voice grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 24, maxHeight: 360, overflowY: 'auto' }}>
        {filtered.map((v, i) => {
          // Match selectedVoice index back against full allVoices list
          const globalIdx = allVoices.findIndex((a) => a.voice_id === v.voice_id);
          const active = selectedVoice === globalIdx;
          return (
            <div
              key={v.voice_id}
              onClick={() => setSelectedVoice(globalIdx)}
              style={{
                background: '#0A0F1E', borderRadius: 10, padding: '11px 14px', cursor: 'pointer',
                border: `1px solid ${active ? 'rgba(124,110,250,0.45)' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: active ? '0 0 14px rgba(124,110,250,0.12)' : 'none',
                display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
              }}
            >
              {/* Avatar */}
              <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? 'rgba(124,110,250,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(124,110,250,0.4)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
                  {[3, 7, 11, 7, 3].map((h, j) => (
                    <div key={j} style={{ width: 2, height: h, background: active ? '#7C6EFA' : '#334155', borderRadius: 1, transition: 'background 0.15s' }} />
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#F1F5F9' : '#64748B', fontFamily: 'var(--font-inter)', transition: 'color 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.name}
                  </span>
                  {v.source === 'library' && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: '#22D3EE', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', padding: '1px 5px', borderRadius: 9999, flexShrink: 0 }}>MY LIB</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {v.gender && (
                    <span style={{ fontSize: 9, color: '#334155', fontFamily: 'var(--font-inter)' }}>{v.gender}</span>
                  )}
                  {v.accent && (
                    <span style={{ fontSize: 9, color: '#334155', fontFamily: 'var(--font-inter)' }}>· {v.accent}</span>
                  )}
                </div>
              </div>

              {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#7C6EFA', flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>

      {/* ── Custom voice ID ── */}
      <SectionCard title="Custom Voice ID">
        <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', fontFamily: 'var(--font-inter)', lineHeight: 1.6 }}>
          Paste any ElevenLabs voice ID to use a cloned or premium voice not listed above.
          Find IDs at <span style={{ color: '#7C6EFA' }}>elevenlabs.io/voice-library</span> or your Voice Lab.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <FInput
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12 }}
          />
          <button
            onClick={() => {
              const trimmed = customId.trim();
              if (!trimmed) return;
              // Check if already in list
              const existing = allVoices.findIndex((v) => v.voice_id === trimmed);
              if (existing >= 0) { setSelectedVoice(existing); setCustomId(''); return; }
              // Add as a new entry at index allVoices.length — parent state holds voice_id via buildBody()
              // We select the matching index but the voice_id from customId is what gets saved
              // Temporarily select the custom ID by calling setSelectedVoice with a sentinel
              // The simplest approach: set selectedVoice to a special index and handle in buildBody
              // Easier: just store customId as selectedVoice directly via a separate prop — but that
              // requires refactoring. Instead, push to allVoices here and select the new index.
              allVoices.push({ voice_id: trimmed, name: `Custom (${trimmed.slice(0, 8)}…)`, source: 'preset' });
              setSelectedVoice(allVoices.length - 1);
              setCustomId('');
            }}
            disabled={!customId.trim()}
            style={{
              flexShrink: 0, padding: '9px 18px', borderRadius: 9, fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600,
              background: customId.trim() ? '#7C6EFA' : '#131B2E',
              border: 'none', color: customId.trim() ? '#fff' : '#334155',
              cursor: customId.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
              boxShadow: customId.trim() ? '0 0 14px rgba(124,110,250,0.3)' : 'none',
            }}
          >
            Use This ID
          </button>
        </div>
      </SectionCard>

      {/* ── Voice tuning ── */}
      <SectionCard title="Voice Tuning">
        <SliderField label="Stability" hint="Higher = more consistent, less expressive" value={stability} onChange={setStability} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} color="#7C6EFA" />
        <SliderField label="Similarity boost" hint="Higher = closer to original voice" value={similarity} onChange={setSimilarity} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} color="#22D3EE" />
      </SectionCard>
    </div>
  );
}

// ─── Script tab ───────────────────────────────────────────────────────────────

const SCRIPT_SECTIONS = [
  { key: 'opener',    label: 'Opener',            icon: '💬', placeholder: 'Initial greeting and purpose of the call…' },
  { key: 'discovery', label: 'Discovery',          icon: '🔍', placeholder: "Questions to understand the prospect's needs…" },
  { key: 'pitch',     label: 'Pitch',              icon: '✨', placeholder: 'How to present your product or service…' },
  { key: 'objection', label: 'Objection Handling', icon: '🛡', placeholder: 'How to handle common objections…' },
  { key: 'closing',   label: 'Closing',            icon: '🎯', placeholder: 'How to close or schedule next steps…' },
  { key: 'faq',       label: 'FAQ',                icon: '❓', placeholder: 'Common questions and their answers…' },
];

function ScriptTab({ opener, setOpener, discovery, setDiscovery, pitch, setPitch, objection, setObjection, closing, setClosing, faq, setFaq }: {
  opener: string; setOpener: (v: string) => void; discovery: string; setDiscovery: (v: string) => void;
  pitch: string; setPitch: (v: string) => void; objection: string; setObjection: (v: string) => void;
  closing: string; setClosing: (v: string) => void; faq: string; setFaq: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['opener']));
  const values: Record<string, string> = { opener, discovery, pitch, objection, closing, faq };
  const setters: Record<string, (v: string) => void> = { opener: setOpener, discovery: setDiscovery, pitch: setPitch, objection: setObjection, closing: setClosing, faq: setFaq };

  return (
    <div style={{ maxWidth: 880 }}>
      <p style={{ fontSize: 12, color: '#475569', marginBottom: 20, lineHeight: 1.65, fontFamily: 'var(--font-inter)' }}>
        Script sections are injected when the agent calls the <code style={{ fontSize: 10, color: '#A89AF9', background: 'rgba(124,110,250,0.1)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-jetbrains-mono)' }}>get_call_script</code> tool. Leave blank to skip.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SCRIPT_SECTIONS.map((s) => {
          const isOpen = expanded.has(s.key);
          const hasContent = !!values[s.key];
          return (
            <div key={s.key} style={{ background: '#0A0F1E', border: `1px solid ${hasContent ? 'rgba(124,110,250,0.18)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setExpanded((prev) => { const n = new Set(prev); isOpen ? n.delete(s.key) : n.add(s.key); return n; })}
                style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ fontSize: 14 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: hasContent ? '#E2E8F0' : '#475569', fontFamily: 'var(--font-inter)' }}>{s.label}</span>
                {hasContent && <span style={{ fontSize: 10, color: '#7C6EFA', fontFamily: 'var(--font-jetbrains-mono)' }}>{values[s.key].length}c</span>}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {isOpen && (
                <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ paddingTop: 12 }}>
                    <FTextarea value={values[s.key]} onChange={(e) => setters[s.key](e.target.value)} rows={4} placeholder={s.placeholder} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Advanced tab ─────────────────────────────────────────────────────────────

function AdvancedTab({ maxDuration, setMaxDuration, silenceTimeout, setSilenceTimeout, llmModel, setLlmModel, temperature, setTemperature }: {
  maxDuration: number; setMaxDuration: (v: number) => void;
  silenceTimeout: number; setSilenceTimeout: (v: number) => void;
  llmModel: string; setLlmModel: (v: string) => void;
  temperature: number; setTemperature: (v: number) => void;
}) {
  return (
    <div style={{ maxWidth: 740 }}>
      <SectionCard title="Call Behavior">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <Label>Max call duration</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FInput type="number" min={30} max={3600} value={maxDuration} onChange={(e) => setMaxDuration(Number(e.target.value))} style={{ width: 90 }} />
              <span style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-inter)', whiteSpace: 'nowrap' }}>sec ({Math.floor(maxDuration / 60)}m {maxDuration % 60}s)</span>
            </div>
          </div>
          <div>
            <Label>Silence timeout</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FInput type="number" min={3} max={60} value={silenceTimeout} onChange={(e) => setSilenceTimeout(Number(e.target.value))} style={{ width: 70 }} />
              <span style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-inter)' }}>seconds</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Language Model">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          {LLM_MODELS.map((m) => {
            const isActive = llmModel === m.id;
            return (
              <div key={m.id} onClick={() => setLlmModel(m.id)} style={{ background: '#080B14', border: `1px solid ${isActive ? `${m.color}40` : 'rgba(255,255,255,0.07)'}`, borderLeft: `3px solid ${isActive ? m.color : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: isActive ? `0 0 14px ${m.color}18` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#F1F5F9' : '#64748B', fontFamily: 'var(--font-inter)' }}>{m.label}</div>
                  {isActive && <div style={{ width: 7, height: 7, borderRadius: '50%', background: m.color }} />}
                </div>
                <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-inter)' }}>{m.desc}</div>
                <div style={{ fontSize: 9, color: m.color, fontWeight: 700, marginTop: 4, opacity: 0.7, fontFamily: 'var(--font-inter)', letterSpacing: '0.04em' }}>{m.provider}</div>
              </div>
            );
          })}
        </div>
        <SliderField label="Temperature" hint="Higher = more creative, less predictable. Keep 0.5–0.8 for sales." value={temperature} onChange={setTemperature} min={0} max={1} step={0.05} fmt={(v) => v.toFixed(2)} color="#F59E0B" />
      </SectionCard>

      <div style={{ padding: 14, background: 'rgba(124,110,250,0.05)', border: '1px solid rgba(124,110,250,0.12)', borderRadius: 10, fontSize: 12, color: '#64748B', lineHeight: 1.6, fontFamily: 'var(--font-inter)' }}>
        <strong style={{ color: '#A89AF9' }}>Tip:</strong> After changing advanced settings, click <strong>Save</strong> then <strong>Go Live</strong> to push to ElevenLabs. Active calls are not affected.
      </div>
    </div>
  );
}

// ─── Slider field ─────────────────────────────────────────────────────────────

function SliderField({ label, hint, value, onChange, min, max, step, fmt, color }: {
  label: string; hint: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; fmt: (v: number) => string; color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Label>{label}</Label>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono), monospace', color: color ?? '#A89AF9' }}>{fmt(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 9999, marginBottom: 4 }}>
        <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: '100%', background: color ?? '#7C6EFA', borderRadius: 9999, transition: 'width 0.1s' }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ position: 'absolute', inset: '50% 0 auto', transform: 'translateY(-50%)', width: '100%', height: 4, opacity: 0, cursor: 'pointer', margin: 0 }} />
      </div>
      <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-inter)' }}>{hint}</div>
    </div>
  );
}
