'use client';

import { useState, useEffect, useRef } from 'react';
import { useAgent, useCreateAgent, useUpdateAgent, useSyncAgent, useVoices } from '@/lib/hooks/useAgents';
import { settings as apiSettings, tools as toolsApi } from '@/lib/api';
import type { AgentCreate, CustomTool, CustomToolCreate } from '@/lib/api';
import { CreateToolModal } from './CreateToolModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'config',   label: 'Config',   icon: 'M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2z' },
  { id: 'tools',    label: 'Tools',    icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { id: 'voice',    label: 'Voice',    icon: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2' },
  { id: 'script',   label: 'Script',   icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  { id: 'advanced', label: 'Advanced', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
];

const LLM_MODELS = [
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',      desc: 'Fastest · Recommended',   provider: 'Google', color: '#4285F4' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', desc: 'Lightest · Lowest cost',  provider: 'Google', color: '#4285F4' },
  { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash',      desc: 'Previous gen · Stable',   provider: 'Google', color: '#4285F4' },
  { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro',        desc: 'Previous gen · Capable',  provider: 'Google', color: '#4285F4' },
  { id: 'gpt-4o-mini',           label: 'GPT-4o Mini',           desc: 'OpenAI · Fast',           provider: 'OpenAI', color: '#10A37F' },
  { id: 'gpt-4o',                label: 'GPT-4o',                desc: 'OpenAI · Best quality',   provider: 'OpenAI', color: '#10A37F' },
  { id: 'gpt-4.1-mini',          label: 'GPT-4.1 Mini',          desc: 'OpenAI · Latest · Fast',  provider: 'OpenAI', color: '#10A37F' },
];

export const BUILTIN_TOOLS: Array<{
  id: string; name: string; desc: string; color: string; tier: 1 | 2; configurable: boolean;
}> = [
  { id: 'save_lead',           name: 'Save Lead',           desc: 'Capture contact info during call',       color: '#00D082', tier: 1, configurable: false },
  { id: 'get_contact_info',    name: 'Get Contact',         desc: 'Fetch existing lead before call',        color: '#38BDF8', tier: 1, configurable: false },
  { id: 'end_call',            name: 'End Call',            desc: 'Terminate call with outcome',            color: '#FF4D6D', tier: 1, configurable: false },
  { id: 'log_call_outcome',    name: 'Log Outcome',         desc: 'Record result and next action',          color: '#00C2B8', tier: 1, configurable: false },
  { id: 'get_call_script',     name: 'Get Script',          desc: 'Fetch script section on demand',         color: '#A89AF9', tier: 1, configurable: false },
  { id: 'update_call_stage',   name: 'Update Stage',        desc: 'Track call stage for analytics',         color: '#64748B', tier: 1, configurable: false },
  { id: 'book_meeting',        name: 'Book Meeting',        desc: 'Schedule via calendar integration',      color: '#F0B429', tier: 2, configurable: true },
  { id: 'send_followup_sms',   name: 'Send Follow-up SMS',  desc: 'Send SMS message after call',            color: '#38BDF8', tier: 2, configurable: true },
  { id: 'qualify_lead',        name: 'Qualify Lead',        desc: 'Score lead against your criteria',       color: '#A89AF9', tier: 2, configurable: false },
  { id: 'lookup_product_info', name: 'Product Info Lookup', desc: 'Answer questions from product catalog',  color: '#00C2B8', tier: 2, configurable: false },
  { id: 'check_crm_record',    name: 'CRM Lookup',          desc: 'Fetch contact from HubSpot/Salesforce',  color: '#F0B429', tier: 2, configurable: true },
  { id: 'update_crm_record',   name: 'CRM Update',          desc: 'Push outcome + notes to CRM',            color: '#00D082', tier: 2, configurable: true },
  { id: 'transfer_to_human',   name: 'Transfer to Human',   desc: 'Warm/cold transfer via conference',      color: '#FF4D6D', tier: 2, configurable: true },
  { id: 'leave_voicemail',     name: 'Leave Voicemail',     desc: 'Play recorded voicemail, end call',      color: '#64748B', tier: 2, configurable: true },
];

export const TIER1_IDS = new Set(BUILTIN_TOOLS.filter((t) => t.tier === 1).map((t) => t.id));

const DEFAULT_TOOL_CONFIGS: Record<string, Record<string, string>> = {
  book_meeting:      { calendar_provider: 'cal.com', api_key: '', calendar_id: '' },
  send_followup_sms: { message_template: "Hi {{lead_first_name}}, thanks for chatting! We'll follow up shortly." },
  check_crm_record:  { provider: 'hubspot', api_key: '' },
  update_crm_record: { provider: 'hubspot', api_key: '' },
  transfer_to_human: { transfer_to: '', mode: 'warm' },
  leave_voicemail:   { default_message: "Hi, this is {{company_name}}. Sorry we missed you — we'll try again soon!" },
};

const POPULAR_VOICES: Array<{ voice_id: string; name: string; gender: string; accent: string }> = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',    gender: 'Female', accent: 'American'   },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',      gender: 'Female', accent: 'American'   },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',     gender: 'Female', accent: 'American'   },
  { voice_id: 'ErXwobaYiN019PkySvjV',  name: 'Antoni',    gender: 'Male',   accent: 'American'   },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',      gender: 'Female', accent: 'American'   },
  { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',      gender: 'Male',   accent: 'American'   },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',    gender: 'Male',   accent: 'American'   },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',      gender: 'Male',   accent: 'American'   },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',       gender: 'Male',   accent: 'American'   },
  { voice_id: 'CYw3kZ38HenStdEgyMUi', name: 'Dave',      gender: 'Male',   accent: 'British'    },
  { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie',   gender: 'Male',   accent: 'Australian' },
  { voice_id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily',     gender: 'Female', accent: 'American'   },
  { voice_id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',    gender: 'Male',   accent: 'American'   },
  { voice_id: 'ODq5zmih8GrVes37Dy38', name: 'Patrick',   gender: 'Male',   accent: 'American'   },
  { voice_id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry',     gender: 'Male',   accent: 'American'   },
  { voice_id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy',   gender: 'Female', accent: 'British'    },
  { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',      gender: 'Male',   accent: 'American'   },
  { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', accent: 'British'    },
  { voice_id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',     gender: 'Female', accent: 'British'    },
  { voice_id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',     gender: 'Male',   accent: 'American'   },
];

const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },  { code: 'pt', label: 'Portuguese' }, { code: 'it', label: 'Italian' },
  { code: 'pl', label: 'Polish' },  { code: 'hi', label: 'Hindi' }, { code: 'ar', label: 'Arabic' },
  { code: 'ja', label: 'Japanese' },{ code: 'zh', label: 'Chinese' },
];

// ─── Shared keyframes injected once ──────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes ab-fade-in   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ab-shake     { 0%,100%{transform:translateX(0)} 18%,54%{transform:translateX(-5px)} 36%,72%{transform:translateX(5px)} }
  @keyframes ab-glow-in   { from{box-shadow:none} to{box-shadow:0 0 0 3px rgba(0,208,130,0.12)} }
  @keyframes ab-toast-in  { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
  @keyframes ab-spin      { to{transform:rotate(360deg)} }
  @keyframes ab-pulse-ring{ 0%{box-shadow:0 0 0 0 rgba(0,208,130,0.4)} 70%{box-shadow:0 0 0 8px rgba(0,208,130,0)} 100%{box-shadow:0 0 0 0 rgba(0,208,130,0)} }
  .ab-shake { animation: ab-shake 0.42s cubic-bezier(0.36,0.07,0.19,0.97) both; }
  .ab-field-error input, .ab-field-error textarea {
    border-color: rgba(255,77,109,0.55) !important;
    box-shadow: 0 0 0 3px rgba(255,77,109,0.08) !important;
  }
`;

// ─── Form primitives ──────────────────────────────────────────────────────────

function GInput({ error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      autoComplete={props.type === 'password' ? 'new-password' : 'off'}
      {...props}
      style={{
        background: 'rgba(6,15,26,0.8)',
        border: `1px solid ${error ? 'rgba(255,77,109,0.55)' : focused ? 'rgba(0,208,130,0.50)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 9, padding: '9px 12px', fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui), sans-serif', outline: 'none',
        width: '100%', boxSizing: 'border-box',
        boxShadow: error ? '0 0 0 3px rgba(255,77,109,0.07)' : focused ? '0 0 0 3px rgba(0,208,130,0.08)' : 'none',
        transition: 'border-color 0.18s, box-shadow 0.18s',
        ...props.style,
      }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e)  => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

function GSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      {...props}
      style={{
        background: 'rgba(6,15,26,0.8)',
        border: `1px solid ${focused ? 'rgba(0,208,130,0.50)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 9, padding: '9px 12px', fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui), sans-serif', outline: 'none',
        width: '100%', boxSizing: 'border-box',
        boxShadow: focused ? '0 0 0 3px rgba(0,208,130,0.08)' : 'none',
        transition: 'border-color 0.18s, box-shadow 0.18s', cursor: 'pointer',
        ...props.style,
      }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e)  => { setFocused(false); props.onBlur?.(e); }}
    >
      {children}
    </select>
  );
}

function GTextarea({ error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{
        background: 'rgba(6,15,26,0.8)',
        border: `1px solid ${error ? 'rgba(255,77,109,0.55)' : focused ? 'rgba(0,208,130,0.50)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 9, padding: '9px 12px', fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui), sans-serif', outline: 'none',
        width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.65,
        boxShadow: error ? '0 0 0 3px rgba(255,77,109,0.07)' : focused ? '0 0 0 3px rgba(0,208,130,0.08)' : 'none',
        transition: 'border-color 0.18s, box-shadow 0.18s',
        ...props.style,
      }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e)  => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

function GLabel({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <label style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
      color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7,
    }}>
      {children}
      {required && <span style={{ color: '#FF4D6D', fontWeight: 800 }}>*</span>}
      {hint && <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 10, opacity: 0.65, marginLeft: 2 }}>{hint}</span>}
    </label>
  );
}

// ─── Glass section card ───────────────────────────────────────────────────────
function SCard({ title, accent = '#00D082', children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: accent, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <div style={{ width: 16, height: 1.5, background: `linear-gradient(90deg, ${accent}, transparent)`, borderRadius: 2 }} />
        {title}
      </div>
      <div style={{
        background: 'rgba(9,20,38,0.65)', backdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14,
        padding: '18px 20px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent 5%, ${accent}55 40%, ${accent}40 60%, transparent 95%)`,
        }} />
        {children}
      </div>
    </div>
  );
}

// ─── Inline error helper ──────────────────────────────────────────────────────
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div style={{
      fontSize: 11, color: '#FF4D6D', marginTop: 5,
      display: 'flex', alignItems: 'center', gap: 5, animation: 'ab-fade-in 0.2s both',
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {msg}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  const ok = type === 'success';
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      background: ok ? 'rgba(9,20,38,0.95)' : 'rgba(9,20,38,0.95)',
      border: `1px solid ${ok ? 'rgba(0,208,130,0.35)' : 'rgba(255,77,109,0.35)'}`,
      borderRadius: 14, padding: '13px 20px',
      fontSize: 13, fontWeight: 600,
      color: ok ? '#00D082' : '#FF4D6D',
      backdropFilter: 'blur(20px)',
      boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${ok ? 'rgba(0,208,130,0.1)' : 'rgba(255,77,109,0.1)'}`,
      display: 'flex', alignItems: 'center', gap: 10,
      animation: 'ab-toast-in 0.28s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: ok ? 'rgba(0,208,130,0.12)' : 'rgba(255,77,109,0.12)',
        border: `1px solid ${ok ? 'rgba(0,208,130,0.25)' : 'rgba(255,77,109,0.25)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
      }}>
        {ok ? '✓' : '✕'}
      </div>
      {msg}
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

  const nameRef = useRef<HTMLDivElement>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [tab,           setTab]           = useState('config');
  const [agentName,     setAgentName]     = useState('');
  const [description,   setDescription]   = useState('');
  const [callType,      setCallType]      = useState<'outbound' | 'inbound' | 'both'>('outbound');
  const [language,      setLanguage]      = useState('en');
  const [systemPrompt,  setSystemPrompt]  = useState('You are a friendly AI voice agent. Your goal is to qualify leads and schedule demos. Keep calls under 3 minutes. Always be professional and helpful.');
  const [firstMessage,  setFirstMessage]  = useState('Hi {{lead_first_name}}, this is calling from {{company_name}}. Do you have a minute?');
  const [companyName,   setCompanyName]   = useState('');
  const [productName,   setProductName]   = useState('');
  const [enabledTools,  setEnabledTools]  = useState<string[]>([...TIER1_IDS]);
  const [toolConfigs,   setToolConfigs]   = useState<Record<string, Record<string, string>>>({ ...DEFAULT_TOOL_CONFIGS });
  const [selectedVoice, setSelectedVoice] = useState(0);
  const [scriptOpener,     setScriptOpener]    = useState('');
  const [scriptDiscovery,  setScriptDiscovery] = useState('');
  const [scriptPitch,      setScriptPitch]     = useState('');
  const [scriptObjection,  setScriptObjection] = useState('');
  const [scriptClosing,    setScriptClosing]   = useState('');
  const [scriptFaq,        setScriptFaq]       = useState('');
  const [maxDuration,    setMaxDuration]    = useState(300);
  const [silenceTimeout, setSilenceTimeout] = useState(10);
  const [llmModel,       setLlmModel]       = useState('gemini-2.0-flash');
  const [temperature,    setTemperature]    = useState(0.7);
  const [ttsModel,       setTtsModel]       = useState('eleven_v3_conversational');
  const [sttProvider,    setSttProvider]    = useState('elevenlabs');
  const [stability,      setStability]      = useState<number | null>(null);
  const [similarity,     setSimilarity]     = useState<number | null>(null);
  const [twilioPhone,       setTwilioPhone]       = useState('');
  const [inboundPhone,      setInboundPhone]      = useState('');
  const [knowledgeBaseId,   setKnowledgeBaseId]   = useState('');
  const [knowledgeBaseName, setKnowledgeBaseName] = useState('');
  const [isSaving,  setIsSaving]  = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Validation state ──────────────────────────────────────────────────────
  const [nameError,        setNameError]        = useState(false);
  const [promptError,      setPromptError]      = useState(false);
  const [shakeId,          setShakeId]          = useState(0);
  const [twilioPhoneError,  setTwilioPhoneError]  = useState(false);
  const [inboundPhoneError, setInboundPhoneError] = useState(false);
  const [twilioCxn,         setTwilioCxn]         = useState<boolean | null>(null);

  useEffect(() => {
    apiSettings.getCredentials()
      .then(d => setTwilioCxn(d.twilio_connected))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!existing) return;
    setAgentName(existing.name);
    setDescription(existing.description ?? '');
    setCallType((existing.call_type === 'inbound' || existing.call_type === 'both') ? existing.call_type as 'inbound' | 'both' : 'outbound');
    setLanguage(existing.language ?? 'en');
    setSystemPrompt(existing.system_prompt ?? '');
    setFirstMessage(existing.first_message ?? '');
    setCompanyName(existing.company_name ?? '');
    setProductName(existing.product_name ?? '');
    setTwilioPhone(existing.twilio_phone_number ?? '');
    setInboundPhone(existing.inbound_phone_number ?? '');
    setKnowledgeBaseId(existing.knowledge_base_id ?? '');
    setKnowledgeBaseName(existing.knowledge_base_name ?? '');
    const tools = existing.enabled_tools ?? [];
    setEnabledTools([...new Set([...TIER1_IDS, ...tools])]);
    const savedCfg = (existing.tool_configs as Record<string, Record<string, string>>) ?? {};
    setToolConfigs({ ...DEFAULT_TOOL_CONFIGS, ...savedCfg });
    setMaxDuration(existing.max_call_duration_seconds ?? 300);
    setSilenceTimeout(existing.silence_timeout_seconds ?? 10);
    setLlmModel(existing.llm_model ?? 'gemini-2.0-flash');
    setTemperature(existing.llm_temperature ?? 0.7);
    setTtsModel(existing.tts_model ?? 'eleven_v3_conversational');
    setSttProvider(existing.stt_provider ?? 'elevenlabs');
    setStability(existing.voice_stability ?? null);
    setSimilarity(existing.voice_similarity ?? null);
    const cs = existing.call_script ?? {};
    setScriptOpener(cs.opener ?? '');
    setScriptDiscovery(cs.discovery ?? '');
    setScriptPitch(cs.pitch ?? '');
    setScriptObjection(cs.objection_handling ?? '');
    setScriptClosing(cs.closing ?? '');
    setScriptFaq(cs.faq ?? '');
    if (voicesData) {
      const libIds = new Set(voicesData.map((v) => v.voice_id));
      const merged = [...voicesData, ...POPULAR_VOICES.filter((v) => !libIds.has(v.voice_id))];
      const idx = merged.findIndex((v) => v.voice_id === existing.voice_id);
      if (idx >= 0) setSelectedVoice(idx);
    }
  }, [existing, voicesData]);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3400);
  }

  const voices = voicesData ?? [];
  const libraryIds = new Set(voices.map((v) => v.voice_id));
  const mergedVoices = [...voices, ...POPULAR_VOICES.filter((v) => !libraryIds.has(v.voice_id))];
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
      twilio_phone_number: twilioPhone || null,
      inbound_phone_number: inboundPhone || null,
      max_call_duration_seconds: maxDuration, silence_timeout_seconds: silenceTimeout,
      llm_model: llmModel, llm_temperature: temperature,
      tts_model: ttsModel, stt_provider: sttProvider,
      voice_stability: stability ?? undefined, voice_similarity: similarity ?? undefined,
      enabled_tools: enabledTools, tool_configs: relevantConfigs as Record<string, unknown>,
      knowledge_base_id: knowledgeBaseId || null,
      knowledge_base_name: knowledgeBaseName || null,
      call_script: {
        opener: scriptOpener || undefined, discovery: scriptDiscovery || undefined,
        pitch: scriptPitch || undefined, objection_handling: scriptObjection || undefined,
        closing: scriptClosing || undefined, faq: scriptFaq || undefined,
      },
    };
  }

  function triggerValidationShake() {
    setShakeId((n) => n + 1);
  }

  async function handleSave() {
    let hasError = false;

    if (!agentName.trim()) {
      setNameError(true);
      hasError = true;
    }
    if (!systemPrompt.trim()) {
      setPromptError(true);
      hasError = true;
    }
    if ((callType === 'outbound' || callType === 'both') && !twilioPhone.trim()) {
      setTwilioPhoneError(true);
      hasError = true;
    }
    if ((callType === 'inbound' || callType === 'both') && !inboundPhone.trim()) {
      setInboundPhoneError(true);
      hasError = true;
    }

    if (hasError) {
      triggerValidationShake();
      setTab('config');
      showToast('Please fill in all required fields', 'error');
      setTimeout(() => nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      return;
    }

    setIsSaving(true);
    try {
      if (isNew) {
        await createAgent.mutateAsync(buildBody());
        showToast('Agent created successfully!', 'success');
        onBack();
      } else {
        await updateAgent.mutateAsync(buildBody());
        showToast('Agent saved!', 'success');
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSync() {
    if (!agentId) return;
    setIsSyncing(true);
    try {
      await syncAgent.mutateAsync(agentId);
      showToast('Synced to ElevenLabs ✓', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  }

  if (isLoading && !isNew) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '2px solid rgba(0,208,130,0.15)',
          borderTopColor: '#00D082',
          animation: 'ab-spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading agent…</span>
      </div>
    );
  }

  const hasEL    = !!existing?.elevenlabs_agent_id;
  const synced   = hasEL && !!existing?.el_last_synced_at;
  const tier2Active = enabledTools.filter((id) => !TIER1_IDS.has(id)).length;
  const configComplete = !!agentName.trim() && !!systemPrompt.trim();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <style>{GLOBAL_STYLES}</style>
      {toast && <Toast {...toast} />}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 28px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(9,18,36,0.98)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 10,
      }}>
        {/* Subtle top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(0,208,130,0.3), rgba(0,194,184,0.2), transparent)',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, padding: '6px 12px', borderRadius: 8, transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Agents
          </button>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.07)' }} />

          {/* Agent name input */}
          <div
            ref={nameRef}
            className={nameError && shakeId > 0 ? 'ab-shake' : ''}
            key={`name-shake-${shakeId}`}
            style={{ position: 'relative' }}
          >
            <input
              value={agentName}
              onChange={(e) => { setAgentName(e.target.value); if (e.target.value.trim()) setNameError(false); }}
              placeholder="Untitled Agent"
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                borderBottom: `1.5px solid ${nameError ? 'rgba(255,77,109,0.6)' : agentName ? 'rgba(0,208,130,0.3)' : 'rgba(255,255,255,0.1)'}`,
                paddingBottom: 3,
                fontFamily: 'var(--font-syne), sans-serif',
                fontSize: 17, fontWeight: 700,
                color: agentName ? 'var(--text-primary)' : 'var(--text-muted)',
                letterSpacing: '-0.02em', width: 260, lineHeight: 1.5,
                transition: 'border-color 0.2s',
              }}
            />
            {nameError && (
              <span style={{
                position: 'absolute', left: 0, top: '100%', marginTop: 3,
                fontSize: 10, color: '#FF4D6D', whiteSpace: 'nowrap',
                animation: 'ab-fade-in 0.2s both',
              }}>
                Name is required
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status badge */}
          {synced ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(0,208,130,0.07)', border: '1px solid rgba(0,208,130,0.2)',
              fontSize: 11, fontWeight: 600, color: '#00D082',
              animation: 'ab-pulse-ring 2.5s infinite',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00D082' }} />
              EL Synced
            </span>
          ) : (
            <span style={{
              padding: '4px 10px', borderRadius: 9999,
              background: 'rgba(240,180,41,0.07)', border: '1px solid rgba(240,180,41,0.2)',
              fontSize: 11, fontWeight: 600, color: '#F0B429',
            }}>
              {isNew ? 'New Agent' : 'Not synced'}
            </span>
          )}

          {!isNew && (
            <button
              onClick={handleSync} disabled={isSyncing}
              style={{
                background: isSyncing ? 'rgba(0,208,130,0.08)' : 'rgba(0,208,130,0.1)',
                border: '1px solid rgba(0,208,130,0.3)',
                borderRadius: 9, padding: '7px 16px',
                fontSize: 12.5, fontWeight: 600, color: '#00D082',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                boxShadow: isSyncing ? 'none' : '0 0 14px rgba(0,208,130,0.12)',
              }}
              onMouseEnter={(e) => { if (!isSyncing) e.currentTarget.style.boxShadow = '0 0 22px rgba(0,208,130,0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 14px rgba(0,208,130,0.12)'; }}
            >
              {isSyncing ? (
                <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(0,208,130,0.3)', borderTopColor: '#00D082', animation: 'ab-spin 0.7s linear infinite' }} />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              )}
              {isSyncing ? 'Syncing…' : 'Sync to EL'}
            </button>
          )}

          {/* Primary save / create button — always visible */}
          <button
            onClick={handleSave} disabled={isSaving}
            style={{
              background: isSaving
                ? 'rgba(0,208,130,0.08)'
                : 'linear-gradient(135deg, rgba(0,208,130,0.22) 0%, rgba(0,194,184,0.14) 100%)',
              border: `1px solid ${isSaving ? 'rgba(0,208,130,0.15)' : 'rgba(0,208,130,0.50)'}`,
              borderRadius: 10, padding: '9px 22px',
              fontSize: 13, fontWeight: 600,
              color: isSaving ? 'rgba(0,208,130,0.5)' : '#00D082',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s',
              boxShadow: isSaving ? 'none' : '0 0 20px rgba(0,208,130,0.18)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => { if (!isSaving) { e.currentTarget.style.boxShadow = '0 0 30px rgba(0,208,130,0.32)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,208,130,0.18)'; e.currentTarget.style.transform = 'none'; }}
          >
            {isSaving ? (
              <>
                <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(0,208,130,0.3)', borderTopColor: '#00D082', animation: 'ab-spin 0.7s linear infinite' }} />
                Saving…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8"/>
                </svg>
                Save
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', padding: '0 24px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(9,18,36,0.95)',
        gap: 2,
      }}>
        {tabs.map((t) => {
          const isActive = tab === t.id;
          const hasBadge = t.id === 'tools' && tier2Active > 0;
          const hasAlert = t.id === 'config' && !configComplete && (nameError || promptError);

          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '13px 16px 11px',
                fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                color: isActive ? '#00D082' : 'var(--text-muted)',
                borderBottom: `2px solid ${isActive ? '#00D082' : 'transparent'}`,
                transition: 'all 0.18s',
                display: 'flex', alignItems: 'center', gap: 6,
                position: 'relative',
                boxShadow: isActive ? '0 2px 12px rgba(0,208,130,0.15)' : 'none',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: isActive ? 1 : 0.5 }}>
                <path d={t.icon} />
              </svg>
              {t.label}
              {hasBadge && (
                <span style={{
                  background: 'rgba(0,208,130,0.18)', color: '#00D082',
                  border: '1px solid rgba(0,208,130,0.3)',
                  fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 9999,
                }}>{tier2Active}</span>
              )}
              {hasAlert && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF4D6D', boxShadow: '0 0 6px rgba(255,77,109,0.6)' }} />
              )}
              {isActive && (
                <div style={{
                  position: 'absolute', bottom: -1, left: '15%', right: '15%', height: 2,
                  background: 'linear-gradient(90deg, transparent, #00D082, transparent)',
                  borderRadius: 2, filter: 'blur(0.5px)',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div
        key={tab}
        style={{
          flex: 1, overflowY: 'auto', padding: '26px 28px',
          animation: 'ab-fade-in 0.25s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {tab === 'config' && (
          <ConfigTab
            agentName={agentName} setAgentName={(v) => { setAgentName(v); if (v.trim()) setNameError(false); }}
            callType={callType} setCallType={setCallType}
            language={language} setLanguage={setLanguage}
            systemPrompt={systemPrompt} setSystemPrompt={(v) => { setSystemPrompt(v); if (v.trim()) setPromptError(false); }}
            firstMessage={firstMessage} setFirstMessage={setFirstMessage}
            companyName={companyName} setCompanyName={setCompanyName}
            productName={productName} setProductName={setProductName}
            description={description} setDescription={setDescription}
            twilioPhone={twilioPhone} setTwilioPhone={(v) => { setTwilioPhone(v); if (v.trim()) setTwilioPhoneError(false); }}
            inboundPhone={inboundPhone} setInboundPhone={(v) => { setInboundPhone(v); if (v.trim()) setInboundPhoneError(false); }}
            nameError={nameError} promptError={promptError}
            twilioPhoneError={twilioPhoneError} inboundPhoneError={inboundPhoneError}
            twilioCxn={twilioCxn}
          />
        )}
        {tab === 'tools'    && (
          <ToolsTab
            agentId={agentId ?? ''}
            enabledTools={enabledTools}
            setEnabledTools={setEnabledTools}
            toolConfigs={toolConfigs}
            setToolConfigs={setToolConfigs}
            knowledgeBaseId={knowledgeBaseId}
            setKnowledgeBaseId={setKnowledgeBaseId}
            knowledgeBaseName={knowledgeBaseName}
            setKnowledgeBaseName={setKnowledgeBaseName}
            onShowToast={showToast}
          />
        )}
        {tab === 'voice'    && <VoiceTab voices={voices} selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice} stability={stability} setStability={setStability} similarity={similarity} setSimilarity={setSimilarity} ttsModel={ttsModel} setTtsModel={setTtsModel} sttProvider={sttProvider} setSttProvider={setSttProvider} />}
        {tab === 'script'   && <ScriptTab opener={scriptOpener} setOpener={setScriptOpener} discovery={scriptDiscovery} setDiscovery={setScriptDiscovery} pitch={scriptPitch} setPitch={setScriptPitch} objection={scriptObjection} setObjection={setScriptObjection} closing={scriptClosing} setClosing={setScriptClosing} faq={scriptFaq} setFaq={setScriptFaq} />}
        {tab === 'advanced' && <AdvancedTab maxDuration={maxDuration} setMaxDuration={setMaxDuration} silenceTimeout={silenceTimeout} setSilenceTimeout={setSilenceTimeout} llmModel={llmModel} setLlmModel={setLlmModel} temperature={temperature} setTemperature={setTemperature} />}
      </div>

    </div>
  );
}

// ─── Config tab ───────────────────────────────────────────────────────────────
function ConfigTab({
  agentName, setAgentName, callType, setCallType, language, setLanguage,
  systemPrompt, setSystemPrompt, firstMessage, setFirstMessage,
  companyName, setCompanyName, productName, setProductName,
  description, setDescription, twilioPhone, setTwilioPhone,
  inboundPhone, setInboundPhone, nameError, promptError,
  twilioPhoneError, inboundPhoneError, twilioCxn,
}: {
  agentName: string; setAgentName: (v: string) => void;
  callType: string; setCallType: (t: 'outbound' | 'inbound' | 'both') => void;
  language: string; setLanguage: (l: string) => void;
  systemPrompt: string; setSystemPrompt: (v: string) => void;
  firstMessage: string; setFirstMessage: (v: string) => void;
  companyName: string; setCompanyName: (v: string) => void;
  productName: string; setProductName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  twilioPhone: string; setTwilioPhone: (v: string) => void;
  inboundPhone: string; setInboundPhone: (v: string) => void;
  nameError: boolean; promptError: boolean;
  twilioPhoneError: boolean; inboundPhoneError: boolean; twilioCxn: boolean | null;
}) {
  return (
    <div style={{ maxWidth: 900 }}>
      {twilioCxn === false && (
        <div style={{
          marginBottom: 20,
          background: 'rgba(240,180,41,0.04)',
          border: '1px solid rgba(240,180,41,0.22)',
          borderRadius: 14,
          padding: '16px 18px',
          display: 'flex', alignItems: 'flex-start', gap: 14,
          position: 'relative', overflow: 'hidden',
          animation: 'ab-fade-in 0.3s both',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(240,180,41,0.55), transparent)' }} />
          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'rgba(240,180,41,0.1)', border: '1px solid rgba(240,180,41,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F0B429" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F0B429', marginBottom: 5, fontFamily: 'var(--font-ui)' }}>Twilio credentials not configured</div>
            <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-ui)', lineHeight: 1.65 }}>
              This agent needs your Twilio account to place or receive calls. Go to{' '}
              <span style={{ color: '#F0B429', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '1px 5px', background: 'rgba(240,180,41,0.08)', borderRadius: 4, border: '1px solid rgba(240,180,41,0.2)' }}>Settings → Credentials</span>
              {' '}and add your Account SID and Auth Token before this agent can handle calls.
            </div>
          </div>
        </div>
      )}
      <SCard title="Agent Identity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <GLabel required>Agent Name</GLabel>
            <GInput
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Sales Agent, Support Bot, Booking Assistant"
              error={nameError}
            />
            <FieldError msg={nameError ? 'Agent name is required to create' : undefined} />
          </div>

          <div>
            <GLabel>Agent Type</GLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['outbound', 'inbound', 'both'] as const).map((t) => {
                const active = callType === t;
                return (
                  <button
                    key={t} onClick={() => setCallType(t)}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 9,
                      border: `1px solid ${active ? 'rgba(0,208,130,0.45)' : 'rgba(255,255,255,0.08)'}`,
                      background: active ? 'rgba(0,208,130,0.1)' : 'rgba(6,15,26,0.8)',
                      color: active ? '#00D082' : 'var(--text-muted)',
                      fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer',
                      textTransform: 'capitalize', transition: 'all 0.18s',
                      boxShadow: active ? '0 0 12px rgba(0,208,130,0.12)' : 'none',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <GLabel>Language</GLabel>
            <GSelect value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </GSelect>
          </div>

          <div>
            <GLabel>Company Name</GLabel>
            <GInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" />
          </div>

          <div>
            <GLabel>Product / Service</GLabel>
            <GInput value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Voxara AI Platform" />
          </div>

          {(callType === 'outbound' || callType === 'both') && (
            <div>
              <GLabel hint="Caller ID · E.164 format" required>Outbound Number</GLabel>
              <GInput value={twilioPhone} onChange={(e) => setTwilioPhone(e.target.value)} placeholder="+12345678900" error={twilioPhoneError} />
              <FieldError msg={twilioPhoneError ? 'Required for outbound calls — add your Twilio number (E.164, e.g. +12345678900)' : undefined} />
            </div>
          )}
          {(callType === 'inbound' || callType === 'both') && (
            <div>
              <GLabel hint="Customers call this · E.164" required>Inbound Number</GLabel>
              <GInput value={inboundPhone} onChange={(e) => setInboundPhone(e.target.value)} placeholder="+12345678900" error={inboundPhoneError} />
              <FieldError msg={inboundPhoneError ? 'Required for inbound calls — add the Twilio number customers dial into' : undefined} />
            </div>
          )}

          <div style={{ gridColumn: '1/-1' }}>
            <GLabel>Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10, opacity: 0.6 }}>(internal)</span></GLabel>
            <GInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this agent's purpose" />
          </div>
        </div>
      </SCard>

      <SCard title="Personality & Goals" accent="#38BDF8">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <GLabel required hint="— agent's personality, goal and tone">System Prompt</GLabel>
            <GTextarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              error={promptError}
              placeholder="You are a friendly AI voice agent…"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <FieldError msg={promptError ? 'System prompt is required' : undefined} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                {systemPrompt.length} chars
              </span>
            </div>
          </div>

          <div>
            <GLabel hint="— {{lead_first_name}}, {{company_name}}, {{product_name}}">First Message</GLabel>
            <GTextarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              rows={3}
              placeholder="Hi {{lead_first_name}}, this is calling from {{company_name}}…"
            />
          </div>
        </div>
      </SCard>
    </div>
  );
}

// ─── EL System tool catalog (static — matches backend system_catalog.py) ─────

const EL_SYSTEM_TOOLS: Array<{
  key: string; label: string; subtitle: string; desc: string; color: string; icon: string;
  configFields: Array<{ key: string; label: string; type: string }>;
}> = [
  {
    key: 'el_transfer_to_number',
    label: 'Transfer to Number',
    subtitle: 'ElevenLabs Native',
    desc: 'Built-in call transfer via SIP REFER or cold/warm dial — no backend required.',
    color: '#7C6EFA',
    icon: 'M16 3h5v5M4 20L21 3M21 3l-5 18-4-7-7-4',
    configFields: [{ key: 'transfers', label: 'Transfer Destinations', type: 'transfer_list' }],
  },
  {
    key: 'el_end_conversation',
    label: 'End Conversation',
    subtitle: 'ElevenLabs Native',
    desc: 'Lets the agent cleanly hang up without additional backend logic.',
    color: '#EF4444',
    icon: 'M3 5a2 2 0 0 1 2-2h3l2 4.5-2.5 1.5a11 11 0 0 0 5 5l1.5-2.5L20 13v3a2 2 0 0 1-2 2 16 16 0 0 1-15-15',
    configFields: [],
  },
  {
    key: 'el_language_detection',
    label: 'Language Detection',
    subtitle: 'ElevenLabs Native',
    desc: 'Detects caller language and switches agent response automatically.',
    color: '#22D3EE',
    icon: 'M2 12a10 10 0 1 0 20 0A10 10 0 0 0 2 12zM12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z',
    configFields: [],
  },
];

// ─── Tools tab ────────────────────────────────────────────────────────────────
function ToolsTab({
  agentId, enabledTools, setEnabledTools, toolConfigs, setToolConfigs,
  knowledgeBaseId, setKnowledgeBaseId, knowledgeBaseName, setKnowledgeBaseName,
  onShowToast,
}: {
  agentId: string;
  enabledTools: string[]; setEnabledTools: (t: string[]) => void;
  toolConfigs: Record<string, Record<string, string>>; setToolConfigs: (c: Record<string, Record<string, string>>) => void;
  knowledgeBaseId: string; setKnowledgeBaseId: (v: string) => void;
  knowledgeBaseName: string; setKnowledgeBaseName: (v: string) => void;
  onShowToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [customTools,     setCustomTools]     = useState<CustomTool[]>([]);
  const [loadingCustom,   setLoadingCustom]   = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTool,     setEditingTool]     = useState<CustomTool | null>(null);
  const [expandedSys,     setExpandedSys]     = useState<string | null>(null);
  const [expandedT2,      setExpandedT2]      = useState<string | null>(null);
  const [_kbFocused,      _setKbFocused]      = useState(false); // reserved for future focus ring

  // Load custom tools for this agent
  useEffect(() => {
    if (!agentId) return;
    setLoadingCustom(true);
    toolsApi.listCustom(agentId)
      .then((r) => setCustomTools(r.items))
      .catch(() => {})
      .finally(() => setLoadingCustom(false));
  }, [agentId]);

  const toggle = (id: string) => {
    if (TIER1_IDS.has(id)) return;
    const next = enabledTools.includes(id) ? enabledTools.filter((t) => t !== id) : [...enabledTools, id];
    setEnabledTools(next);
    // Auto-expand config when enabling a configurable tool
    if (!enabledTools.includes(id)) {
      if (EL_SYSTEM_TOOLS.find((s) => s.key === id)) setExpandedSys(id);
      else setExpandedT2(id);
    }
  };

  const updateConfig = (toolId: string, key: string, value: string) => {
    const updated = { ...toolConfigs, [toolId]: { ...toolConfigs[toolId], [key]: value } };
    if (toolId === 'check_crm_record' || toolId === 'update_crm_record') {
      const partner = toolId === 'check_crm_record' ? 'update_crm_record' : 'check_crm_record';
      updated[partner] = { ...updated[partner], [key]: value };
    }
    setToolConfigs(updated);
  };

  const updateSysConfig = (toolKey: string, subKey: string, value: unknown) => {
    const existing = (toolConfigs[toolKey] ?? {}) as Record<string, unknown>;
    setToolConfigs({ ...toolConfigs, [toolKey]: { ...existing, [subKey]: value } } as Record<string, Record<string, string>>);
  };

  const handleCreateTool = async (data: CustomToolCreate) => {
    const created = await toolsApi.createCustom(data);
    setCustomTools((prev) => [created, ...prev]);
    setShowCreateModal(false);
    onShowToast('Tool created!', 'success');
  };

  const handleUpdateTool = async (data: CustomToolCreate) => {
    if (!editingTool) return;
    const updated = await toolsApi.updateCustom(editingTool.id, data);
    setCustomTools((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    setEditingTool(null);
    onShowToast('Tool updated!', 'success');
  };

  const handleDeleteTool = async (tool: CustomTool) => {
    await toolsApi.deleteCustom(tool.id);
    setCustomTools((prev) => prev.filter((t) => t.id !== tool.id));
    onShowToast('Tool deleted', 'success');
  };

  const tier1 = BUILTIN_TOOLS.filter((t) => t.tier === 1);
  const tier2 = BUILTIN_TOOLS.filter((t) => t.tier === 2);

  const kbActive = !!knowledgeBaseId.trim();

  return (
    <div style={{ maxWidth: 860 }}>

      {/* ── Core Platform Tools ─────────────────────────────────────────────── */}
      <SCard title="Core Platform Tools">
        <div style={{
          fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.55,
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00D082" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Always active on every call — no configuration needed.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {tier1.map((tool) => (
            <ToolCard key={tool.id} tool={tool} active locked />
          ))}
        </div>
      </SCard>

      {/* ── ElevenLabs Native Tools ──────────────────────────────────────────── */}
      <SCard title="ElevenLabs Native Tools" accent="#7C6EFA">
        <div style={{
          fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.55,
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C6EFA" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
          </svg>
          Built-in ElevenLabs capabilities — handled natively without backend callbacks.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EL_SYSTEM_TOOLS.map((sys) => {
            const active = enabledTools.includes(sys.key);
            const expanded = expandedSys === sys.key && active;
            const cfg = (toolConfigs[sys.key] ?? {}) as Record<string, string>;
            return (
              <div key={sys.key} style={{
                background: 'rgba(6,15,26,0.8)',
                border: `1px solid ${active ? `${sys.color}30` : 'rgba(255,255,255,0.06)'}`,
                borderLeft: `3px solid ${active ? sys.color : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 11, overflow: 'hidden', transition: 'border-color 0.2s',
              }}>
                <div
                  style={{
                    padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggle(sys.key)}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: active ? `${sys.color}15` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? `${sys.color}35` : 'rgba(255,255,255,0.07)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? sys.color : 'rgba(255,255,255,0.3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={sys.icon}/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {sys.label}
                      </span>
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                        color: sys.color, background: `${sys.color}14`, padding: '2px 6px', borderRadius: 9999,
                      }}>{sys.subtitle}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{sys.desc}</div>
                  </div>
                  {/* Toggle */}
                  <div style={{
                    width: 36, height: 20, borderRadius: 9999, position: 'relative', flexShrink: 0,
                    background: active ? `${sys.color}25` : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${active ? `${sys.color}50` : 'rgba(255,255,255,0.1)'}`,
                    transition: 'all 0.25s', boxShadow: active ? `0 0 12px ${sys.color}30` : 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: active ? 17 : 3,
                      width: 12, height: 12, borderRadius: '50%',
                      background: active ? sys.color : 'rgba(255,255,255,0.3)',
                      transition: 'left 0.25s, background 0.25s',
                      boxShadow: active ? `0 0 6px ${sys.color}` : 'none',
                    }} />
                  </div>
                  {/* Expand chevron */}
                  {active && sys.configFields.length > 0 && (
                    <div
                      onClick={(e) => { e.stopPropagation(); setExpandedSys(expanded ? null : sys.key); }}
                      style={{ color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Config panel for transfer_to_number */}
                {expanded && sys.key === 'el_transfer_to_number' && (
                  <div style={{
                    padding: '14px 18px 16px', borderTop: `1px solid ${sys.color}18`,
                    background: `${sys.color}05`,
                    animation: 'ab-fade-in 0.18s both',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                      Configure transfer destinations. The agent will use the first matching condition.
                    </div>
                    {/* Transfers array — simplified to first entry */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <GLabel>Transfer-to number (E.164)</GLabel>
                        <GInput
                          value={cfg.phone_number ?? ''}
                          onChange={(e) => updateSysConfig(sys.key, 'phone_number', e.target.value)}
                          placeholder="+15551234567"
                        />
                      </div>
                      <div>
                        <GLabel>Transfer type</GLabel>
                        <GSelect
                          value={cfg.transfer_type ?? 'cold'}
                          onChange={(e) => updateSysConfig(sys.key, 'transfer_type', e.target.value)}
                        >
                          <option value="cold">Cold transfer</option>
                          <option value="warm">Warm transfer</option>
                          <option value="sip_refer">SIP REFER</option>
                        </GSelect>
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <GLabel hint="— optional">Transfer condition</GLabel>
                        <GInput
                          value={cfg.condition ?? ''}
                          onChange={(e) => updateSysConfig(sys.key, 'condition', e.target.value)}
                          placeholder="e.g. when user requests to speak with a human"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SCard>

      {/* ── Platform Extension Tools (Tier 2) ──────────────────────────────── */}
      <SCard title="Platform Extension Tools" accent="#38BDF8">
        <div style={{
          fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.55,
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          Optional tools with server-side execution. Some require API credentials.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {tier2.map((tool) => {
            const active = enabledTools.includes(tool.id);
            const expanded = expandedT2 === tool.id && active && tool.configurable;
            const cfg = toolConfigs[tool.id] ?? {};
            return (
              <div key={tool.id} style={{
                background: 'rgba(6,15,26,0.8)',
                border: `1px solid ${active ? `${tool.color}28` : 'rgba(255,255,255,0.05)'}`,
                borderLeft: `3px solid ${active ? tool.color : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
              }}>
                <div
                  style={{
                    padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggle(tool.id)}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', background: tool.color, flexShrink: 0,
                    opacity: active ? 1 : 0.25, boxShadow: active ? `0 0 6px ${tool.color}` : 'none', transition: 'all 0.2s',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-muted)', marginBottom: 1 }}>
                      {tool.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{tool.desc}</div>
                  </div>
                  {/* Toggle */}
                  <div style={{
                    width: 32, height: 17, borderRadius: 9999, position: 'relative', flexShrink: 0,
                    background: active ? 'rgba(0,208,130,0.2)' : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${active ? 'rgba(0,208,130,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    transition: 'all 0.25s', boxShadow: active ? '0 0 10px rgba(0,208,130,0.3)' : 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: 2.5, left: active ? 15 : 2.5,
                      width: 10, height: 10, borderRadius: '50%',
                      background: active ? '#00D082' : 'rgba(255,255,255,0.3)',
                      transition: 'left 0.25s, background 0.25s',
                      boxShadow: active ? '0 0 6px #00D082' : 'none',
                    }} />
                  </div>
                  {/* Config expand */}
                  {active && tool.configurable && (
                    <div
                      onClick={(e) => { e.stopPropagation(); setExpandedT2(expanded ? null : tool.id); }}
                      style={{ color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Inline config panel */}
                {expanded && (
                  <div style={{
                    padding: '14px 16px 16px',
                    borderTop: `1px solid ${tool.color}15`,
                    background: `${tool.color}04`,
                    animation: 'ab-fade-in 0.18s both',
                  }}>
                    <ToolConfigPanel tool={tool} config={cfg} onChange={(key, val) => updateConfig(tool.id, key, val)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SCard>

      {/* ── Knowledge Base ───────────────────────────────────────────────────── */}
      <SCard title="ElevenLabs Knowledge Base" accent="#10B981">
        <div style={{
          background: 'rgba(6,15,26,0.8)',
          border: `1px solid ${kbActive ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
          borderLeft: `3px solid ${kbActive ? '#10B981' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 11, overflow: 'hidden', transition: 'border-color 0.2s',
        }}>
          {/* Header row — always visible */}
          <div style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'default' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: kbActive ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${kbActive ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.07)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={kbActive ? '#10B981' : 'rgba(255,255,255,0.3)'} strokeWidth="2" strokeLinecap="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: kbActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {kbActive ? (knowledgeBaseName || 'Knowledge Base Connected') : 'Knowledge Base'}
                </span>
                {kbActive && (
                  <span style={{
                    fontSize: 8.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    color: '#10B981', background: 'rgba(16,185,129,0.12)', padding: '2px 6px', borderRadius: 9999,
                  }}>Connected</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {kbActive
                  ? `ID: ${knowledgeBaseId}`
                  : 'Connect an ElevenLabs KB so the agent can query your docs during calls'}
              </div>
            </div>
            {/* Toggle */}
            <div
              onClick={() => { if (kbActive) { setKnowledgeBaseId(''); setKnowledgeBaseName(''); } }}
              style={{
                width: 36, height: 20, borderRadius: 9999, position: 'relative', flexShrink: 0,
                background: kbActive ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${kbActive ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.25s', boxShadow: kbActive ? '0 0 12px rgba(16,185,129,0.3)' : 'none',
                cursor: kbActive ? 'pointer' : 'default',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: kbActive ? 17 : 3,
                width: 12, height: 12, borderRadius: '50%',
                background: kbActive ? '#10B981' : 'rgba(255,255,255,0.3)',
                transition: 'left 0.25s, background 0.25s',
                boxShadow: kbActive ? '0 0 6px #10B981' : 'none',
              }} />
            </div>
          </div>

          {/* Connect form — always shown but styled differently when active */}
          <div style={{
            padding: '0 15px 16px',
            borderTop: `1px solid ${kbActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)'}`,
            paddingTop: 14,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <GLabel>Knowledge Base ID</GLabel>
                <GInput
                  value={knowledgeBaseId}
                  onChange={(e) => setKnowledgeBaseId(e.target.value)}
                  placeholder="kb_xxxxxxxxxxxxxxxx"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
                />
              </div>
              <div>
                <GLabel hint="— display only">Name / label</GLabel>
                <GInput
                  value={knowledgeBaseName}
                  onChange={(e) => setKnowledgeBaseName(e.target.value)}
                  placeholder="Product Docs, FAQs, etc."
                />
              </div>
            </div>

            {/* Info row */}
            <div style={{
              background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)',
              borderRadius: 8, padding: '10px 12px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.6, flex: 1 }}>
                Create and upload documents (PDF, DOCX, TXT, web URLs) in your{' '}
                <span style={{ color: '#10B981', fontWeight: 600 }}>ElevenLabs dashboard → Conversational AI → Knowledge Bases</span>.
                Paste the KB ID here once created. Supported: product docs, FAQs, scripts, policies.
              </div>
            </div>
          </div>
        </div>
      </SCard>

      {/* ── Custom Tools ──────────────────────────────────────────────────────── */}
      <SCard title="Custom Tools" accent="#F0B429">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            User-created webhook, client, or MCP tools. Automatically synced to ElevenLabs.
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 9,
              border: '1px solid rgba(240,180,41,0.4)',
              background: 'rgba(240,180,41,0.08)',
              color: '#F0B429', fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
              fontFamily: 'var(--font-ui), sans-serif',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(240,180,41,0.14)'; e.currentTarget.style.borderColor = 'rgba(240,180,41,0.6)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(240,180,41,0.08)'; e.currentTarget.style.borderColor = 'rgba(240,180,41,0.4)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create tool
          </button>
        </div>

        {loadingCustom ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#F0B429', animation: 'ab-spin 0.7s linear infinite' }} />
            Loading custom tools…
          </div>
        ) : customTools.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '28px 0',
            border: '1px dashed rgba(240,180,41,0.15)', borderRadius: 11,
            color: 'var(--text-muted)', fontSize: 12,
          }}>
            <div style={{ marginBottom: 8, fontSize: 22 }}>⚙️</div>
            No custom tools yet — create webhook, client, or MCP tools above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {customTools.map((ct) => {
              const typeColor = ct.el_tool_type === 'webhook' ? '#22D3EE' : ct.el_tool_type === 'client' ? '#7C6EFA' : '#A89AF9';
              return (
                <div key={ct.id} style={{
                  background: 'rgba(6,15,26,0.8)',
                  border: `1px solid ${ct.is_active ? `${typeColor}25` : 'rgba(255,255,255,0.05)'}`,
                  borderLeft: `3px solid ${ct.is_active ? typeColor : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 10, padding: '11px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  opacity: ct.is_active ? 1 : 0.5,
                  transition: 'all 0.2s',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {ct.name}
                      </span>
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                        color: typeColor, background: `${typeColor}14`, padding: '2px 6px', borderRadius: 9999,
                      }}>{ct.el_tool_type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ct.description}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setEditingTool(ct)}
                      style={{
                        padding: '4px 10px', borderRadius: 7,
                        border: `1px solid ${typeColor}30`,
                        background: `${typeColor}08`, color: typeColor,
                        fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        transition: 'all 0.15s',
                      }}
                    >Edit</button>
                    <button
                      onClick={() => handleDeleteTool(ct)}
                      style={{
                        padding: '4px 10px', borderRadius: 7,
                        border: '1px solid rgba(255,77,109,0.25)',
                        background: 'rgba(255,77,109,0.06)',
                        color: '#FF4D6D', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        transition: 'all 0.15s',
                      }}
                    >Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SCard>

      {/* Create / Edit modal */}
      {showCreateModal && (
        <CreateToolModal
          agentId={agentId}
          onSave={handleCreateTool}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {editingTool && (
        <CreateToolModal
          agentId={agentId}
          editTool={editingTool}
          onSave={handleUpdateTool}
          onClose={() => setEditingTool(null)}
        />
      )}
    </div>
  );
}

function ToolCard({ tool, active, locked }: { tool: typeof BUILTIN_TOOLS[number]; active: boolean; locked?: boolean }) {
  return (
    <div style={{
      background: 'rgba(6,15,26,0.8)',
      border: `1px solid ${active ? `${tool.color}28` : 'rgba(255,255,255,0.06)'}`,
      borderLeft: `3px solid ${active ? tool.color : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10, padding: '10px 13px',
      cursor: 'default',
      boxShadow: active ? `0 0 10px ${tool.color}06` : 'none',
      display: 'flex', alignItems: 'flex-start', gap: 9,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', background: tool.color,
        flexShrink: 0, marginTop: 5,
        boxShadow: active ? `0 0 6px ${tool.color}` : 'none',
        opacity: active ? 1 : 0.25,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tool.name}
          </div>
          {locked && (
            <span style={{
              fontSize: 7.5, fontWeight: 800, color: tool.color,
              background: `${tool.color}14`, padding: '2px 5px',
              borderRadius: 9999, flexShrink: 0, letterSpacing: '0.07em', textTransform: 'uppercase',
            }}>Core</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.45 }}>{tool.desc}</div>
      </div>
    </div>
  );
}

function ToolConfigPanel({ tool, config, onChange }: { tool: typeof BUILTIN_TOOLS[number]; config: Record<string, string>; onChange: (key: string, val: string) => void }) {
  return (
    <div>
      {tool.id === 'book_meeting' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <GLabel>Calendar provider</GLabel>
            <GSelect value={config.calendar_provider ?? 'cal.com'} onChange={(e) => onChange('calendar_provider', e.target.value)}>
              <option value="cal.com">Cal.com</option>
              <option value="google_calendar">Google Calendar</option>
              <option value="calendly">Calendly</option>
            </GSelect>
          </div>
          <div>
            <GLabel>Calendar ID / username</GLabel>
            <GInput value={config.calendar_id ?? ''} onChange={(e) => onChange('calendar_id', e.target.value)} placeholder="your-username" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <GLabel>API key</GLabel>
            <GInput type="password" value={config.api_key ?? ''} onChange={(e) => onChange('api_key', e.target.value)} placeholder="cal_xxxxxxxxxx" />
          </div>
        </div>
      )}
      {tool.id === 'send_followup_sms' && (
        <div>
          <GLabel hint="— {{lead_first_name}}, {{company_name}}">Message template</GLabel>
          <GTextarea value={config.message_template ?? ''} onChange={(e) => onChange('message_template', e.target.value)} rows={3} placeholder="Hi {{lead_first_name}}, thanks for chatting!" />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            {(config.message_template ?? '').length}/160
          </div>
        </div>
      )}
      {(tool.id === 'check_crm_record' || tool.id === 'update_crm_record') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <GLabel>CRM provider</GLabel>
            <GSelect value={config.provider ?? 'hubspot'} onChange={(e) => onChange('provider', e.target.value)}>
              <option value="hubspot">HubSpot</option>
              <option value="salesforce">Salesforce</option>
            </GSelect>
          </div>
          <div>
            <GLabel>API key / token</GLabel>
            <GInput type="password" value={config.api_key ?? ''} onChange={(e) => onChange('api_key', e.target.value)} placeholder="pat-na1-xxxxxxxxxx" />
          </div>
          <div style={{
            gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px',
            background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)',
          }}>
            CRM Lookup and CRM Update share the same credentials.
          </div>
        </div>
      )}
      {tool.id === 'transfer_to_human' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <GLabel>Transfer-to number (E.164)</GLabel>
            <GInput value={config.transfer_to ?? ''} onChange={(e) => onChange('transfer_to', e.target.value)} placeholder="+15551234567" />
          </div>
          <div>
            <GLabel>Transfer mode</GLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['warm', 'cold'] as const).map((m) => {
                const isActive = (config.mode ?? 'warm') === m;
                return (
                  <button key={m} onClick={() => onChange('mode', m)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    border: `1px solid ${isActive ? 'rgba(0,208,130,0.45)' : 'rgba(255,255,255,0.08)'}`,
                    background: isActive ? 'rgba(0,208,130,0.1)' : 'rgba(6,15,26,0.8)',
                    color: isActive ? '#00D082' : 'var(--text-muted)',
                    fontSize: 12.5, fontWeight: isActive ? 600 : 500, cursor: 'pointer',
                    textTransform: 'capitalize', transition: 'all 0.15s',
                  }}>{m}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {tool.id === 'leave_voicemail' && (
        <div>
          <GLabel>Default voicemail message</GLabel>
          <GTextarea value={config.default_message ?? ''} onChange={(e) => onChange('default_message', e.target.value)} rows={3} placeholder="Hi, this is {{company_name}}. Sorry we missed you!" />
        </div>
      )}
    </div>
  );
}

// ─── Voice tab ────────────────────────────────────────────────────────────────
const TTS_MODELS = [
  { id: 'eleven_v3_conversational', label: 'Eleven v3 Conversational', badge: 'LATEST', desc: 'Most natural · Highest quality · Recommended for all calls',      color: '#00D082' },
  { id: 'eleven_flash_v2',          label: 'Flash v2',                 badge: 'FAST',   desc: 'Ultra-low latency (~75ms) · English only · Best for speed',       color: '#38BDF8' },
  { id: 'eleven_multilingual_v2',   label: 'Multilingual v2',          badge: 'MULTI',  desc: 'Best for non-English calls · Supports 29 languages',               color: '#A89AF9' },
];

const STT_PROVIDERS = [
  { id: 'elevenlabs',     label: 'ElevenLabs Native', badge: 'DEFAULT',  desc: 'Reliable · Battle-tested · Low latency',                    color: '#00D082' },
  { id: 'scribe_v2',     label: 'Scribe v2',          badge: 'ACCURATE', desc: 'Highest accuracy · Best for complex accents',               color: '#38BDF8' },
  { id: 'scribe_v2_turbo', label: 'Scribe v2 Turbo',  badge: 'FASTEST',  desc: 'Lowest latency · Slightly less accurate than Scribe v2',   color: '#F0B429' },
  { id: 'scribe_realtime', label: 'Scribe Realtime',   badge: 'STREAM',   desc: 'Real-time streaming · Good for long pauses & noisy lines', color: '#A89AF9' },
];

function VoiceTab({ voices, selectedVoice, setSelectedVoice, stability, setStability, similarity, setSimilarity, ttsModel, setTtsModel, sttProvider, setSttProvider }: {
  voices: Array<{ voice_id: string; name: string }>; selectedVoice: number; setSelectedVoice: (i: number) => void;
  stability: number | null; setStability: (v: number | null) => void;
  similarity: number | null; setSimilarity: (v: number | null) => void;
  ttsModel: string; setTtsModel: (v: string) => void;
  sttProvider: string; setSttProvider: (v: string) => void;
}) {
  const [customId, setCustomId] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');

  const libraryIds = new Set(voices.map((v) => v.voice_id));
  const presets    = POPULAR_VOICES.filter((v) => !libraryIds.has(v.voice_id));

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
      <SCard title="Select Voice">
        {/* Filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['all', 'female', 'male'] as const).map((g) => (
              <button key={g} onClick={() => setGenderFilter(g)} style={{
                padding: '4px 12px', borderRadius: 9999, fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                border: `1px solid ${genderFilter === g ? 'rgba(0,208,130,0.45)' : 'rgba(255,255,255,0.08)'}`,
                background: genderFilter === g ? 'rgba(0,208,130,0.1)' : 'transparent',
                color: genderFilter === g ? '#00D082' : 'var(--text-muted)',
              }}>
                {g === 'all' ? 'All voices' : g === 'female' ? '♀ Female' : '♂ Male'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filtered.length} voices
            {voices.length > 0 && <span style={{ color: '#00D082', marginLeft: 6 }}>· {voices.length} from your EL library</span>}
          </span>
        </div>

        {/* Voice grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 340, overflowY: 'auto', marginBottom: 4 }}>
          {filtered.map((v) => {
            const globalIdx = allVoices.findIndex((a) => a.voice_id === v.voice_id);
            const active = selectedVoice === globalIdx;
            return (
              <div
                key={v.voice_id}
                onClick={() => setSelectedVoice(globalIdx)}
                style={{
                  background: active ? 'rgba(0,208,130,0.06)' : 'rgba(6,15,26,0.8)',
                  borderRadius: 10, padding: '11px 14px', cursor: 'pointer',
                  border: `1px solid ${active ? 'rgba(0,208,130,0.40)' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: active ? '0 0 16px rgba(0,208,130,0.12)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.18s',
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'rgba(0,208,130,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'rgba(0,208,130,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  transition: 'all 0.18s',
                }}>
                  <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
                    {[3, 7, 11, 7, 3].map((h, j) => (
                      <div key={j} style={{
                        width: 2, height: h, borderRadius: 1,
                        background: active ? '#00D082' : 'rgba(255,255,255,0.2)',
                        transition: 'background 0.18s',
                        animation: active ? `ab-spin 0s` : 'none',
                      }} />
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                      transition: 'color 0.18s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{v.name}</span>
                    {v.source === 'library' && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, color: '#38BDF8',
                        background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)',
                        padding: '1px 5px', borderRadius: 9999, flexShrink: 0,
                      }}>MY LIB</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {v.gender ?? ''}{v.accent ? ` · ${v.accent}` : ''}
                  </div>
                </div>
                {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00D082', boxShadow: '0 0 8px #00D082', flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </SCard>

      <SCard title="Custom Voice ID" accent="#38BDF8">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 12 }}>
          Paste any ElevenLabs voice ID to use a cloned or premium voice not listed above.
          Find IDs at <span style={{ color: '#38BDF8' }}>elevenlabs.io/voice-library</span> or your Voice Lab.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <GInput
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12 }}
          />
          <button
            onClick={() => {
              const trimmed = customId.trim();
              if (!trimmed) return;
              const existing = allVoices.findIndex((v) => v.voice_id === trimmed);
              if (existing >= 0) { setSelectedVoice(existing); setCustomId(''); return; }
              allVoices.push({ voice_id: trimmed, name: `Custom (${trimmed.slice(0, 8)}…)`, source: 'preset' });
              setSelectedVoice(allVoices.length - 1);
              setCustomId('');
            }}
            disabled={!customId.trim()}
            style={{
              flexShrink: 0, padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: customId.trim() ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${customId.trim() ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: customId.trim() ? '#38BDF8' : 'var(--text-muted)',
              cursor: customId.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            }}
          >
            Use This ID
          </button>
        </div>
      </SCard>

      {/* TTS Model */}
      <SCard title="TTS Model (Text-to-Speech Engine)" accent="#00D082">
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Controls how the agent's voice is synthesized. Affects quality, naturalness, and latency.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TTS_MODELS.map((m) => {
            const active = ttsModel === m.id;
            return (
              <div key={m.id} onClick={() => setTtsModel(m.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: active ? 'rgba(0,208,130,0.06)' : 'rgba(6,15,26,0.8)',
                border: `1px solid ${active ? 'rgba(0,208,130,0.35)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 10, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.18s',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: active ? m.color : 'rgba(255,255,255,0.15)',
                  boxShadow: active ? `0 0 8px ${m.color}` : 'none',
                  transition: 'all 0.18s',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#F1F5F9' : 'var(--text-muted)' }}>{m.label}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                      color: m.color, background: `${m.color}18`,
                      border: `1px solid ${m.color}40`,
                    }}>{m.badge}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </SCard>

      {/* STT Provider */}
      <SCard title="STT Provider (Speech-to-Text / Transcription)" accent="#38BDF8">
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Controls how the caller's speech is transcribed to text. Affects accuracy and response latency.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STT_PROVIDERS.map((s) => {
            const active = sttProvider === s.id;
            return (
              <div key={s.id} onClick={() => setSttProvider(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: active ? 'rgba(56,189,248,0.06)' : 'rgba(6,15,26,0.8)',
                border: `1px solid ${active ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 10, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.18s',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: active ? s.color : 'rgba(255,255,255,0.15)',
                  boxShadow: active ? `0 0 8px ${s.color}` : 'none',
                  transition: 'all 0.18s',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#F1F5F9' : 'var(--text-muted)' }}>{s.label}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 9999,
                      color: s.color, background: `${s.color}18`,
                      border: `1px solid ${s.color}40`,
                    }}>{s.badge}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </SCard>

      {/* Voice Tuning */}
      <SCard title="Voice Tuning" accent="#A89AF9">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            Fine-tune the selected voice. Disable to use the voice&apos;s built-in ElevenLabs defaults.
          </p>
          <button
            onClick={() => { setStability(stability === null ? 0.5 : null); setSimilarity(similarity === null ? 0.75 : null); }}
            style={{
              flexShrink: 0, marginLeft: 16, padding: '5px 14px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.18s',
              background: stability !== null ? 'rgba(168,154,249,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${stability !== null ? 'rgba(168,154,249,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: stability !== null ? '#A89AF9' : 'var(--text-muted)',
            }}
          >
            {stability !== null ? 'Custom ✓' : 'Use Defaults'}
          </button>
        </div>
        {stability !== null ? (
          <>
            <GSlider label="Stability" hint="Higher = more consistent, less expressive" value={stability} onChange={(v) => setStability(v)} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} color="#00D082" />
            <GSlider label="Similarity Boost" hint="Higher = closer to the original voice" value={similarity ?? 0.75} onChange={(v) => setSimilarity(v)} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} color="#38BDF8" />
          </>
        ) : (
          <div style={{
            padding: '14px 16px', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.6,
          }}>
            Using the voice&apos;s native ElevenLabs defaults — no overrides applied. Each voice is tuned by its creator for optimal sound.
          </div>
        )}
      </SCard>
    </div>
  );
}

// ─── Script tab ───────────────────────────────────────────────────────────────
const SCRIPT_SECTIONS = [
  { key: 'opener',    label: 'Opener',            icon: '💬', placeholder: 'Initial greeting and purpose of the call…',        accent: '#00D082' },
  { key: 'discovery', label: 'Discovery',          icon: '🔍', placeholder: "Questions to understand the prospect's needs…",   accent: '#38BDF8' },
  { key: 'pitch',     label: 'Pitch',              icon: '✨', placeholder: 'How to present your product or service…',          accent: '#A89AF9' },
  { key: 'objection', label: 'Objection Handling', icon: '🛡', placeholder: 'How to handle common objections…',                 accent: '#F0B429' },
  { key: 'closing',   label: 'Closing',            icon: '🎯', placeholder: 'How to close or schedule next steps…',             accent: '#00C2B8' },
  { key: 'faq',       label: 'FAQ',                icon: '❓', placeholder: 'Common questions and their answers…',              accent: '#FF4D6D' },
];

function ScriptTab({ opener, setOpener, discovery, setDiscovery, pitch, setPitch, objection, setObjection, closing, setClosing, faq, setFaq }: {
  opener: string; setOpener: (v: string) => void; discovery: string; setDiscovery: (v: string) => void;
  pitch: string; setPitch: (v: string) => void; objection: string; setObjection: (v: string) => void;
  closing: string; setClosing: (v: string) => void; faq: string; setFaq: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['opener']));
  const values: Record<string, string>   = { opener, discovery, pitch, objection, closing, faq };
  const setters: Record<string, (v: string) => void> = { opener: setOpener, discovery: setDiscovery, pitch: setPitch, objection: setObjection, closing: setClosing, faq: setFaq };

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{
        padding: '10px 14px', marginBottom: 20,
        background: 'rgba(0,208,130,0.04)', border: '1px solid rgba(0,208,130,0.12)',
        borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55,
      }}>
        Script sections inject context when the agent calls the{' '}
        <code style={{ fontSize: 10.5, color: '#00D082', background: 'rgba(0,208,130,0.1)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
          get_call_script
        </code>{' '}
        tool. Leave blank to skip a section.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SCRIPT_SECTIONS.map((s) => {
          const isOpen   = expanded.has(s.key);
          const hasContent = !!values[s.key];
          return (
            <div key={s.key} style={{
              background: 'rgba(9,20,38,0.65)', backdropFilter: 'blur(20px)',
              border: `1px solid ${hasContent ? `${s.accent}25` : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s',
            }}>
              <button
                onClick={() => setExpanded((prev) => { const n = new Set(prev); isOpen ? n.delete(s.key) : n.add(s.key); return n; })}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  padding: '13px 16px', display: 'flex', alignItems: 'center',
                  gap: 10, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 15 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: hasContent ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {s.label}
                </span>
                {hasContent && (
                  <span style={{
                    fontSize: 9.5, color: s.accent, fontFamily: 'var(--font-mono)',
                    background: `${s.accent}12`, border: `1px solid ${s.accent}25`,
                    padding: '2px 7px', borderRadius: 9999, fontWeight: 600,
                  }}>
                    {values[s.key].length}c
                  </span>
                )}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"
                  style={{ transition: 'transform 0.22s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {isOpen && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', animation: 'ab-fade-in 0.2s both' }}>
                  <div style={{ paddingTop: 14 }}>
                    <GTextarea value={values[s.key]} onChange={(e) => setters[s.key](e.target.value)} rows={4} placeholder={s.placeholder} />
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
      <SCard title="Call Behavior">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <GLabel>Max call duration</GLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <GInput type="number" min={30} max={3600} value={maxDuration} onChange={(e) => setMaxDuration(Number(e.target.value))} style={{ width: 90 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                sec ({Math.floor(maxDuration / 60)}m {maxDuration % 60}s)
              </span>
            </div>
          </div>
          <div>
            <GLabel>Silence timeout</GLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <GInput type="number" min={3} max={60} value={silenceTimeout} onChange={(e) => setSilenceTimeout(Number(e.target.value))} style={{ width: 70 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>seconds</span>
            </div>
          </div>
        </div>
      </SCard>

      <SCard title="Language Model" accent="#38BDF8">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {LLM_MODELS.map((m) => {
            const active = llmModel === m.id;
            return (
              <div
                key={m.id}
                onClick={() => setLlmModel(m.id)}
                style={{
                  background: active ? `rgba(${m.color === '#4285F4' ? '66,133,244' : m.color === '#10A37F' ? '16,163,127' : '230,116,42'},0.06)` : 'rgba(6,15,26,0.8)',
                  border: `1px solid ${active ? `${m.color}45` : 'rgba(255,255,255,0.07)'}`,
                  borderLeft: `3px solid ${active ? m.color : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 11, padding: '13px 14px', cursor: 'pointer',
                  transition: 'all 0.18s',
                  boxShadow: active ? `0 0 16px ${m.color}15` : 'none',
                  transform: active ? 'translateY(-1px)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 0.18s' }}>
                    {m.label}
                  </div>
                  {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, boxShadow: `0 0 6px ${m.color}` }} />}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4 }}>{m.desc}</div>
                <div style={{
                  fontSize: 9, fontWeight: 800, color: m.color, letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: `${m.color}10`, border: `1px solid ${m.color}20`,
                  padding: '1px 6px', borderRadius: 9999, display: 'inline-block',
                }}>{m.provider}</div>
              </div>
            );
          })}
        </div>
        <GSlider
          label="Temperature"
          hint="Higher = more creative & varied. Recommended 0.5–0.8 for sales calls."
          value={temperature} onChange={setTemperature}
          min={0} max={1} step={0.05}
          fmt={(v) => v.toFixed(2)} color="#F0B429"
        />
      </SCard>

      <div style={{
        padding: '12px 16px',
        background: 'rgba(0,208,130,0.04)', border: '1px solid rgba(0,208,130,0.1)',
        borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65,
      }}>
        <strong style={{ color: '#00D082' }}>Tip:</strong> Settings are synced to ElevenLabs on every Save.
        Use <strong style={{ color: 'var(--text-secondary)' }}>Sync to EL</strong> only if a previous sync failed or the agent was modified externally.
        Active calls are never affected mid-session.
      </div>
    </div>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────
function GSlider({ label, hint, value, onChange, min, max, step, fmt, color = '#00D082' }: {
  label: string; hint: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; fmt: (v: number) => string; color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <GLabel>{label}</GLabel>
        <span style={{
          fontSize: 14, fontWeight: 700,
          fontFamily: 'var(--font-mono), monospace', color,
          background: `${color}10`, border: `1px solid ${color}20`,
          padding: '2px 10px', borderRadius: 8,
        }}>{fmt(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 9999, marginBottom: 6 }}>
        <div style={{
          position: 'absolute', left: 0, width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}AA, ${color})`,
          borderRadius: 9999,
          boxShadow: `0 0 8px ${color}40`,
          transition: 'width 0.1s',
        }} />
        {/* Track thumb glow */}
        <div style={{
          position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)',
          width: 14, height: 14, borderRadius: '50%',
          background: color, boxShadow: `0 0 10px ${color}, 0 0 20px ${color}50`,
          border: '2px solid rgba(6,15,26,0.8)',
          transition: 'left 0.1s',
          pointerEvents: 'none',
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: '50% 0 auto',
            transform: 'translateY(-50%)', width: '100%', height: 5,
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{hint}</div>
    </div>
  );
}
