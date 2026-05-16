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
  { id: 'analysis', label: 'Analysis', icon: 'M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z' },
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
  { id: 'save_lead',           name: 'Save Lead',           desc: 'Capture contact info during call',       color: '#10B981', tier: 1, configurable: false },
  { id: 'get_contact_info',    name: 'Get Contact',         desc: 'Fetch existing lead before call',        color: '#38BDF8', tier: 1, configurable: false },
  { id: 'end_call',            name: 'End Call',            desc: 'Terminate call with outcome',            color: '#FF4D6D', tier: 1, configurable: false },
  { id: 'log_call_outcome',    name: 'Log Outcome',               desc: 'Record result and next action',              color: '#06B6D4', tier: 1, configurable: true },
  { id: 'get_call_script',     name: 'Product / Service Details', desc: 'Retrieve product info or playbook section',   color: '#A89AF9', tier: 1, configurable: true },
  { id: 'update_call_stage',   name: 'Update Stage',              desc: 'Track call stage for analytics',             color: '#64748B', tier: 1, configurable: true },
  { id: 'book_meeting',        name: 'Book Meeting',        desc: 'Schedule via calendar integration',      color: '#F0B429', tier: 2, configurable: true },
  { id: 'send_followup_sms',   name: 'Send Follow-up SMS',  desc: 'Send SMS message after call',            color: '#38BDF8', tier: 2, configurable: true },
  { id: 'qualify_lead',        name: 'Qualify Lead',        desc: 'Score lead against your criteria',       color: '#A89AF9', tier: 2, configurable: false },
  { id: 'lookup_product_info', name: 'Product Info Lookup', desc: 'Answer questions from product catalog',  color: '#06B6D4', tier: 2, configurable: false },
  { id: 'check_crm_record',    name: 'CRM Lookup',          desc: 'Fetch contact from HubSpot/Salesforce',  color: '#F0B429', tier: 2, configurable: true },
  { id: 'update_crm_record',   name: 'CRM Update',          desc: 'Push outcome + notes to CRM',            color: '#10B981', tier: 2, configurable: true },
  { id: 'transfer_to_human',   name: 'Transfer to Human (Custom)',   desc: 'Transfers via Twilio with dual-channel recording + AI transcription of the human-agent conversation.',      color: '#FF4D6D', tier: 2, configurable: true },
  { id: 'leave_voicemail',     name: 'Leave Voicemail',     desc: 'Play recorded voicemail, end call',      color: '#64748B', tier: 2, configurable: true },
];

export const TIER1_IDS = new Set(BUILTIN_TOOLS.filter((t) => t.tier === 1).map((t) => t.id));

// Static fallback descriptions — exactly match backend defaults.
// Dynamically overwritten from GET /api/v1/tools/catalog on mount.
const DEFAULT_TOOL_DESCRIPTIONS: Record<string, string> = {
  // Tier 1 — from @register_tool decorators
  save_lead: "Save or update the contact information for the person you're speaking with. Call this whenever you learn new details about them.",
  get_contact_info: "Look up existing information about the contact you're speaking with, including their history and previous interactions.",
  end_call: "End the call. IMPORTANT: Before calling this tool, always say a proper closing line to the contact and give them a chance to respond or ask anything else. Only call end_call after you have verbally said goodbye and the contact has acknowledged or there is a clear natural end to the conversation. Never cut the call abruptly mid-sentence or without a warm closing.",
  log_call_outcome: "Log the outcome of this call before ending the conversation. Call this once you have a clear sense of the result — typically just before saying goodbye. The post-call system will verify and may refine the outcome from the full transcript, so an approximate value is fine if you are unsure.",
  get_call_script: "Retrieve a specific section of your product details, service information, or playbook to guide the conversation.",
  update_call_stage: "Track the current stage of the conversation for analytics and reporting.",
  // Tier 2 registered
  transfer_to_human: "Transfer this call to a human agent. Trigger when: (1) the customer explicitly asks for a human, (2) you cannot resolve the issue after genuine effort, (3) the customer is highly upset or the matter requires personal judgment. REQUIRED: Before calling this tool you MUST say to the customer exactly: 'I understand — let me connect you with one of our team members right away. Please hold for just a moment.' Call this tool immediately after saying that. Do not wait for a reply.",
  leave_voicemail: "Leave a voicemail message when the contact does not answer, then end the call.",
  // Tier 2 server (from tier2_catalog.py)
  book_meeting: "Book a meeting or appointment for the contact via the configured calendar integration.",
  send_followup_sms: "Send a follow-up SMS message to the contact after the call.",
  lookup_product_info: "Look up product or pricing information from the agent's product catalog.",
  check_crm_record: "Look up the contact's existing record in the CRM by phone number.",
  update_crm_record: "Push call outcome and notes to the contact's CRM record.",
  qualify_lead: "Score and qualify the lead based on the agent's criteria.",
};

// Live descriptions fetched from backend — overlays DEFAULT_TOOL_DESCRIPTIONS.
// Mutated once on first ToolsTab mount; module-level so it persists across re-renders.
const _liveToolDescriptions: Record<string, string> = { ...DEFAULT_TOOL_DESCRIPTIONS };
// Live default configs from backend catalog — overlays DEFAULT_TOOL_CONFIGS.
const _liveDefaultConfigs: Record<string, Record<string, unknown>> = {};
let _catalogFetched = false;

// Default configs — must exactly match backend defaults (tier2_catalog.py + individual tool handlers).
// These are pre-filled for new agents and shown as placeholders for existing ones.
const DEFAULT_TOOL_CONFIGS: Record<string, Record<string, string>> = {
  // Tier 1 configurable
  get_call_script:    { custom_sections: '' },
  log_call_outcome:   { custom_outcomes: '' },
  update_call_stage:  { custom_stages: '' },
  // Tier 2 registered
  transfer_to_human: {
    transfer_to: '', mode: 'cold',
    post_transfer_outcome: 'transferred_to_human',
    connecting_message: "Connecting you now — please hold while we transfer your call.",
    unavailable_message: "I'm sorry — I wasn't able to connect you to a human agent because no transfer number has been configured. Please contact us directly and I'll do everything I can to help you in the meantime.",
    config_error_message: "I'm sorry — the transfer could not be completed due to a configuration issue. I apologize for the inconvenience. Is there anything I can help you with directly?",
    transfer_failed_message: "I was unable to complete the transfer at this time. I apologize for the inconvenience.",
  },
  leave_voicemail:    { default_message: "Hi, this is {{company_name}}. Sorry we missed you — we'll try again soon!" },
  // Tier 2 server (from tier2_catalog.py default_config)
  book_meeting:          { calendar_provider: 'cal.com', calendar_id: '', api_key: '' },
  send_followup_sms:     { message_template: "Thank you for your time today!" },
  check_crm_record:      { provider: 'hubspot', api_key: '' },
  update_crm_record:     { provider: 'hubspot', api_key: '' },
  // EL system tools (from system_catalog.py default_config)
  el_transfer_to_number: {
    transfers: JSON.stringify([{ id: 'rule_1', number: '', condition: 'customer explicitly requests to speak with a human', transfer_type: 'conference', post_dial_digits: '' }]),
    client_message_mode: 'model', client_message_fixed: 'Please hold while I connect you to our team.',
    agent_message_mode: 'model',  agent_message_fixed: '',
    disable_interruptions: 'false', tool_error_handling_mode: 'auto',
  },
  el_end_conversation:   { disable_interruptions: 'false', tool_error_handling_mode: 'auto' },
  el_language_detection: { disable_interruptions: 'false', tool_error_handling_mode: 'auto' },
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
  @keyframes ab-glow-in   { from{box-shadow:none} to{box-shadow:0 0 0 0 rgba(0,0,0,0)} }
  @keyframes ab-toast-in  { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
  @keyframes ab-unfold    { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ab-spin      { to{transform:rotate(360deg)} }
  @keyframes ab-pulse-ring{ 0%{box-shadow:0 0 0 0 rgba(16,185,129,0.35)} 70%{box-shadow:0 0 0 8px rgba(0,0,0,0)} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0)} }
  .ab-shake { animation: ab-shake 0.42s cubic-bezier(0.36,0.07,0.19,0.97) both; }
  .ab-field-error input, .ab-field-error textarea {
    border-color: #F43F5E !important;
    box-shadow: 0 0 0 3px rgba(244,63,94,0.08) !important;
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
        background: '#FFFFFF',
        border: `1px solid ${error ? '#F43F5E' : focused ? '#10B981' : '#E2E8F0'}`,
        borderRadius: 9, padding: '9px 12px', fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui), sans-serif', outline: 'none',
        width: '100%', boxSizing: 'border-box',
        boxShadow: error ? '0 0 0 3px rgba(244,63,94,0.08)' : focused ? '0 0 0 3px rgba(16,185,129,0.12)' : 'none',
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
        background: '#FFFFFF',
        border: `1px solid ${focused ? '#10B981' : '#E2E8F0'}`,
        borderRadius: 9, padding: '9px 12px', fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui), sans-serif', outline: 'none',
        width: '100%', boxSizing: 'border-box',
        boxShadow: focused ? '0 0 0 3px rgba(16,185,129,0.12)' : 'none',
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
        background: '#FFFFFF',
        border: `1px solid ${error ? '#F43F5E' : focused ? '#10B981' : '#E2E8F0'}`,
        borderRadius: 9, padding: '9px 12px', fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui), sans-serif', outline: 'none',
        width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.65,
        boxShadow: error ? '0 0 0 3px rgba(244,63,94,0.08)' : focused ? '0 0 0 3px rgba(16,185,129,0.12)' : 'none',
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
function SCard({ title, accent = '#10B981', children }: { title: string; accent?: string; children: React.ReactNode }) {
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
        background: '#FFFFFF', backdropFilter: 'none',
        border: '1px solid #E2E8F0', borderRadius: 14,
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
      background: ok ? '#FFFFFF' : '#FFFFFF',
      border: `1px solid ${ok ? 'rgba(0,208,130,0.35)' : 'rgba(255,77,109,0.35)'}`,
      borderRadius: 14, padding: '13px 20px',
      fontSize: 13, fontWeight: 600,
      color: ok ? '#10B981' : '#FF4D6D',
      backdropFilter: 'none',
      boxShadow: `0 12px 32px rgba(15,23,42,0.10), 0 0 0 1px ${ok ? 'rgba(0,208,130,0.1)' : 'rgba(255,77,109,0.1)'}`,
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
  const [evaluationCriteria, setEvaluationCriteria] = useState<Array<{ id: string; name: string; conversation_goal_prompt: string; scope: 'conversation' | 'agent' }>>([]);
  const [dataCollection, setDataCollection] = useState<Array<{ id: string; name: string; type: 'string' | 'boolean' | 'number' | 'enum'; description: string }>>([]);
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
    const mergedCfg: Record<string, Record<string, string>> = { ...DEFAULT_TOOL_CONFIGS, ...savedCfg };

    // Seed agent-level fields into tool_configs so their UI editors can display them
    const existingAny = existing as unknown as Record<string, unknown>;
    const prodCatalog = existingAny.product_catalog as object[] | undefined;
    if (prodCatalog && prodCatalog.length > 0 && !mergedCfg.lookup_product_info?.catalog_json) {
      mergedCfg.lookup_product_info = { ...(mergedCfg.lookup_product_info ?? {}), catalog_json: JSON.stringify(prodCatalog, null, 2) };
    }
    const qualCrit = existingAny.qualification_criteria as Record<string, string> | undefined;
    if (qualCrit && Object.keys(qualCrit).length > 0 && !mergedCfg.qualify_lead?.criteria_json) {
      mergedCfg.qualify_lead = { ...(mergedCfg.qualify_lead ?? {}), criteria_json: JSON.stringify(qualCrit, null, 2) };
    }
    setToolConfigs(mergedCfg);
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
    setEvaluationCriteria((existing as unknown as Record<string, unknown>).evaluation_criteria as typeof evaluationCriteria ?? []);
    setDataCollection((existing as unknown as Record<string, unknown>).data_collection as typeof dataCollection ?? []);
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

  function buildBody() {
    const relevantConfigs: Record<string, Record<string, string>> = {};
    for (const toolId of enabledTools) {
      if (toolConfigs[toolId]) relevantConfigs[toolId] = toolConfigs[toolId];
    }

    // Extract agent-level fields from tool_configs UI editors
    // lookup_product_info stores catalog as catalog_json (JSON string → array)
    let productCatalog: object[] = (existing as unknown as Record<string, unknown>)?.product_catalog as object[] ?? [];
    const catalogRaw = toolConfigs.lookup_product_info?.catalog_json;
    if (catalogRaw) { try { productCatalog = JSON.parse(catalogRaw); } catch { /* keep existing */ } }

    // qualify_lead stores criteria as criteria_json (JSON string → dict)
    let qualificationCriteria: Record<string, string> = (existing as unknown as Record<string, unknown>)?.qualification_criteria as Record<string, string> ?? {};
    const criteriaRaw = toolConfigs.qualify_lead?.criteria_json;
    if (criteriaRaw) { try { qualificationCriteria = JSON.parse(criteriaRaw); } catch { /* keep existing */ } }

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
      product_catalog: productCatalog,
      qualification_criteria: qualificationCriteria,
      knowledge_base_id: knowledgeBaseId || null,
      knowledge_base_name: knowledgeBaseName || null,
      call_script: {
        opener: scriptOpener || undefined, discovery: scriptDiscovery || undefined,
        pitch: scriptPitch || undefined, objection_handling: scriptObjection || undefined,
        closing: scriptClosing || undefined, faq: scriptFaq || undefined,
      },
      evaluation_criteria: evaluationCriteria,
      data_collection: dataCollection,
    } as AgentCreate;
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
          border: '2px solid #CBD5E1',
          borderTopColor: '#10B981',
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
        borderBottom: '1px solid #E2E8F0',
        background: '#FFFFFF', backdropFilter: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', zIndex: 10,
      }}>
        {/* Subtle top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.3), rgba(6,182,212,0.2), transparent)',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              background: '#F8FAFC', border: '1px solid #E2E8F0',
              cursor: 'pointer', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, padding: '6px 12px', borderRadius: 8, transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Agents
          </button>

          <div style={{ width: 1, height: 18, background: '#E2E8F0' }} />

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
                borderBottom: `1.5px solid ${nameError ? '#F43F5E' : agentName ? '#10B981' : '#CBD5E1'}`,
                paddingBottom: 3,
                fontFamily: 'var(--font-display), sans-serif',
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
              fontSize: 11, fontWeight: 600, color: '#10B981',
              animation: 'ab-pulse-ring 2.5s infinite',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981' }} />
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
                fontSize: 12.5, fontWeight: 600, color: '#10B981',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                boxShadow: isSyncing ? 'none' : '0 0 0 rgba(0,0,0,0)',
              }}
              onMouseEnter={(e) => { if (!isSyncing) e.currentTarget.style.boxShadow = '0 0 0 rgba(0,0,0,0)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 0 rgba(0,0,0,0)'; }}
            >
              {isSyncing ? (
                <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(0,208,130,0.3)', borderTopColor: '#10B981', animation: 'ab-spin 0.7s linear infinite' }} />
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
              border: `1px solid ${isSaving ? '#CBD5E1' : 'rgba(0,208,130,0.50)'}`,
              borderRadius: 10, padding: '9px 22px',
              fontSize: 13, fontWeight: 600,
              color: isSaving ? 'rgba(0,208,130,0.5)' : '#10B981',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s',
              boxShadow: isSaving ? 'none' : '0 0 0 rgba(0,0,0,0)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => { if (!isSaving) { e.currentTarget.style.boxShadow = '0 0 0 rgba(0,0,0,0)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 0 rgba(0,0,0,0)'; e.currentTarget.style.transform = 'none'; }}
          >
            {isSaving ? (
              <>
                <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(0,208,130,0.3)', borderTopColor: '#10B981', animation: 'ab-spin 0.7s linear infinite' }} />
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
        borderBottom: '1px solid #F1F5F9',
        background: '#FAFAFA',
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
                color: isActive ? '#10B981' : 'var(--text-muted)',
                borderBottom: `2px solid ${isActive ? '#10B981' : 'transparent'}`,
                transition: 'all 0.18s',
                display: 'flex', alignItems: 'center', gap: 6,
                position: 'relative',
                boxShadow: isActive ? '0 2px 12px #CBD5E1' : 'none',
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
                  background: 'rgba(0,208,130,0.18)', color: '#10B981',
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
          background: '#F8FAFC',
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
        {tab === 'voice'    && <VoiceTab voices={voices} selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice} ttsModel={ttsModel} setTtsModel={setTtsModel} sttProvider={sttProvider} setSttProvider={setSttProvider} />}
        {tab === 'script'   && <ScriptTab opener={scriptOpener} setOpener={setScriptOpener} discovery={scriptDiscovery} setDiscovery={setScriptDiscovery} pitch={scriptPitch} setPitch={setScriptPitch} objection={scriptObjection} setObjection={setScriptObjection} closing={scriptClosing} setClosing={setScriptClosing} faq={scriptFaq} setFaq={setScriptFaq} />}
        {tab === 'analysis' && <AnalysisTab evaluationCriteria={evaluationCriteria} setEvaluationCriteria={setEvaluationCriteria} dataCollection={dataCollection} setDataCollection={setDataCollection} />}
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
                const colors: Record<string, { active: string; glow: string }> = {
                  outbound: { active: '#38BDF8', glow: 'rgba(56,189,248,0.18)' },
                  inbound:  { active: '#10B981', glow: 'rgba(0,208,130,0.18)' },
                  both:     { active: '#A89AF9', glow: 'rgba(168,154,249,0.18)' },
                };
                const clr = colors[t];
                return (
                  <button
                    key={t} onClick={() => setCallType(t)}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 9,
                      border: `1px solid ${active ? clr.active : '#E2E8F0'}`,
                      background: active ? clr.glow : '#F8FAFC',
                      color: active ? clr.active : '#94A3B8',
                      fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer',
                      textTransform: 'capitalize', transition: 'all 0.18s',
                      opacity: active ? 1 : 0.75,
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
  hasConfig: boolean;
}> = [
  {
    key: 'el_transfer_to_number',
    label: 'Transfer to Number (EL Native)',
    subtitle: 'EL Native',
    desc: 'ElevenLabs handles the transfer natively — no dual-channel recording. Best for simple warm/cold transfers.',
    color: '#22D3EE',
    icon: 'M16 3h5v5M4 20L21 3M21 3l-5 18-4-7-7-4',
    hasConfig: true,
  },
  {
    key: 'el_end_conversation',
    label: 'End Conversation',
    subtitle: 'EL Native',
    desc: 'Agent cleanly hangs up without additional backend logic.',
    color: '#EF4444',
    icon: 'M18 6 6 18M6 6l12 12',
    hasConfig: true,
  },
  {
    key: 'el_language_detection',
    label: 'Language Detection',
    subtitle: 'EL Native',
    desc: 'Auto-detects caller language and switches response language.',
    color: '#22D3EE',
    icon: 'M2 12a10 10 0 1 0 20 0A10 10 0 0 0 2 12zM12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z',
    hasConfig: true,
  },
];

// ─── Slim toggle switch ───────────────────────────────────────────────────────
function ToggleSwitch({ active, color = '#10B981' }: { active: boolean; color?: string }) {
  return (
    <div style={{
      width: 34, height: 18, borderRadius: 9999, position: 'relative', flexShrink: 0,
      background: active ? `${color}18` : '#F1F5F9',
      border: `1px solid ${active ? `${color}55` : '#E2E8F0'}`,
      transition: 'all 0.22s',
      boxShadow: active ? `0 0 10px ${color}28` : 'none',
    }}>
      <div style={{
        position: 'absolute', top: 3, left: active ? 16 : 3,
        width: 10, height: 10, borderRadius: '50%',
        background: active ? color : '#CBD5E1',
        transition: 'left 0.22s, background 0.22s',
        boxShadow: active ? `0 0 5px ${color}` : 'none',
      }} />
    </div>
  );
}

// ─── Expand chevron ────────────────────────────────────────────────────────────
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" style={{ transition: 'transform 0.22s', transform: open ? 'rotate(180deg)' : 'none', opacity: 0.4 }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

// ─── Inline expand panel wrapper (CSS height transition) ──────────────────────
function ExpandPanel({ open, color = '#F8FAFC', children }: { open: boolean; color?: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  if (!mounted) return null;
  return (
    <div style={{
      overflow: 'hidden',
      maxHeight: open ? 600 : 0,
      opacity: open ? 1 : 0,
      transition: 'max-height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.2s',
    }}>
      <div style={{
        padding: '16px 16px 18px',
        borderTop: '1px solid #EDF2F7',
        background: color,
        animation: open ? 'ab-unfold 0.18s both' : 'none',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────
// ─── EL Transfer-to-Number config panel ──────────────────────────────────────

interface TransferRule { id: string; number: string; condition: string; transfer_type: string; post_dial_digits?: string; }

function parseTransferRules(raw: unknown): TransferRule[] {
  try {
    const p = JSON.parse(typeof raw === 'string' ? raw : '[]');
    if (Array.isArray(p) && p.length > 0) return p as TransferRule[];
  } catch { /* fall through */ }
  return [{ id: 'rule_1', number: '', condition: 'customer explicitly requests to speak with a human', transfer_type: 'conference', post_dial_digits: '' }];
}

function newRule(): TransferRule {
  return { id: `rule_${Date.now()}`, number: '', condition: '', transfer_type: 'conference', post_dial_digits: '' };
}

function ELTransferConfig({ sysKey, cfg, updateSysConfig }: {
  sysKey: string;
  cfg: Record<string, unknown>;
  updateSysConfig: (key: string, field: string, value: unknown) => void;
}) {
  const rules = parseTransferRules(cfg.transfers);

  const setRules = (next: TransferRule[]) =>
    updateSysConfig(sysKey, 'transfers', JSON.stringify(next));

  const addRule    = () => setRules([...rules, newRule()]);
  const removeRule = (id: string) => setRules(rules.filter(r => r.id !== id));
  const updateRule = (id: string, field: keyof TransferRule, val: string) =>
    setRules(rules.map(r => r.id === id ? { ...r, [field]: val } : r));

  const clientMode  = String(cfg.client_message_mode  ?? 'model');
  const agentMode   = String(cfg.agent_message_mode   ?? 'model');
  const clientFixed = String(cfg.client_message_fixed ?? '');
  const agentFixed  = String(cfg.agent_message_fixed  ?? '');

  const ruleNumbers = rules.map(r => r.number).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Transfer Rules ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <GLabel>Transfer Rules</GLabel>
          <button
            onClick={addRule}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
              border: '1px dashed #7C6EFA60', background: '#7C6EFA08',
              color: '#7C6EFA', cursor: 'pointer', fontFamily: 'var(--font-ui), sans-serif',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#7C6EFA15'; e.currentTarget.style.borderColor = '#7C6EFA'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#7C6EFA08'; e.currentTarget.style.borderColor = '#7C6EFA60'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Department
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map((rule, idx) => (
            <div key={rule.id} style={{
              background: '#FAFAFA', border: '1px solid #E2E8F0',
              borderRadius: 12, padding: '14px 16px',
              position: 'relative',
            }}>
              {/* Rule header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#7C6EFA', background: '#7C6EFA12', borderRadius: 5, padding: '3px 8px',
                }}>
                  Rule {idx + 1}
                </span>
                {rules.length > 1 && (
                  <button
                    onClick={() => removeRule(rule.id)}
                    style={{
                      fontSize: 11, color: '#94A3B8', background: 'none', border: '1px solid #E2E8F0',
                      borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      fontFamily: 'var(--font-ui), sans-serif', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <GLabel required>Phone number (E.164)</GLabel>
                  <GInput
                    type="tel"
                    value={rule.number}
                    onChange={e => updateRule(rule.id, 'number', e.target.value)}
                    placeholder="+15551234567"
                  />
                </div>
                <div>
                  <GLabel>Transfer type</GLabel>
                  <GSelect value={rule.transfer_type} onChange={e => updateRule(rule.id, 'transfer_type', e.target.value)}>
                    <option value="conference">Conference — warm, supports agent message</option>
                    <option value="blind">Blind — direct, preserves caller ID</option>
                    <option value="sip_refer">SIP REFER — SIP protocol only</option>
                  </GSelect>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <GLabel hint="— natural language, tells the model when to use this rule">Routing condition</GLabel>
                  <GInput
                    value={rule.condition}
                    onChange={e => updateRule(rule.id, 'condition', e.target.value)}
                    placeholder="e.g. customer requests to speak with sales team"
                  />
                </div>
                <div>
                  <GLabel hint="— digits to dial after connecting, e.g. 1w2 (Twilio native only, optional)">Post-dial digits</GLabel>
                  <GInput
                    value={rule.post_dial_digits ?? ''}
                    onChange={e => updateRule(rule.id, 'post_dial_digits', e.target.value)}
                    placeholder="e.g. 1w2 (optional)"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Client Message ── */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <GLabel>Client Message</GLabel>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4 }}>
              Spoken to the customer while they wait on hold during transfer
            </div>
          </div>
          <GSelect
            value={clientMode}
            onChange={e => updateSysConfig(sysKey, 'client_message_mode', e.target.value)}
            style={{ width: 'auto', minWidth: 160, fontSize: 12 }}
          >
            <option value="model">Model generates</option>
            <option value="fixed">Fixed text</option>
          </GSelect>
        </div>
        {clientMode === 'fixed' ? (
          <GTextarea
            value={clientFixed}
            onChange={e => updateSysConfig(sysKey, 'client_message_fixed', e.target.value)}
            rows={2}
            placeholder="e.g. Please hold while I connect you to our team — this will only take a moment."
          />
        ) : (
          <div style={{
            fontSize: 12, color: '#64748B', fontStyle: 'italic',
            padding: '8px 10px', background: '#EFF6FF', borderRadius: 7,
            border: '1px solid #BFDBFE',
          }}>
            The model will generate a personalised hold message for the customer based on the conversation context.
          </div>
        )}
      </div>

      {/* ── Agent Message ── */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <GLabel>Agent Message</GLabel>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -4 }}>
              Spoken to the human agent when they pick up, before being connected to the customer
            </div>
          </div>
          <GSelect
            value={agentMode}
            onChange={e => updateSysConfig(sysKey, 'agent_message_mode', e.target.value)}
            style={{ width: 'auto', minWidth: 160, fontSize: 12 }}
          >
            <option value="model">Model generates</option>
            <option value="fixed">Fixed text</option>
          </GSelect>
        </div>
        {agentMode === 'fixed' ? (
          <GTextarea
            value={agentFixed}
            onChange={e => updateSysConfig(sysKey, 'agent_message_fixed', e.target.value)}
            rows={2}
            placeholder="e.g. Hi, AI transfer. Customer is asking about a billing issue. Please assist."
          />
        ) : (
          <div style={{
            fontSize: 12, color: '#64748B', fontStyle: 'italic',
            padding: '8px 10px', background: '#EFF6FF', borderRadius: 7,
            border: '1px solid #BFDBFE',
          }}>
            The model will generate a briefing message for the human agent with context from the call.
          </div>
        )}
        {rules.some(r => r.transfer_type !== 'conference') && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            marginTop: 10, padding: '7px 10px',
            background: '#FFFBEB', border: '1px solid #FCD34D',
            borderRadius: 7, fontSize: 11.5, color: '#92400E',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Agent message is only spoken on <strong>Conference</strong> transfers (Twilio native). Rules using <em>Blind</em> or <em>SIP REFER</em> will not deliver this message.</span>
          </div>
        )}
      </div>

      {/* ── LLM Parameters info ── */}
      <div style={{
        background: '#F0FDF4', border: '1px solid #A7F3D0',
        borderRadius: 10, padding: '12px 14px',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
          color: '#059669', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          What the model passes when calling this tool
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: '#1E293B', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>
            <span style={{ color: '#7C6EFA', fontWeight: 700 }}>transfer_number</span>
            <span style={{ color: '#64748B' }}> (string, required)</span>
            {ruleNumbers.length > 0
              ? <span style={{ color: '#374151' }}> — picks from: {ruleNumbers.join(', ')}</span>
              : <span style={{ color: '#F59E0B' }}> — configure at least one number above</span>
            }
          </div>
          <div>
            <span style={{ color: '#7C6EFA', fontWeight: 700 }}>client_message</span>
            <span style={{ color: '#64748B' }}> (string, required)</span>
            <span style={{ color: '#374151' }}> — {clientMode === 'fixed' ? 'fixed: "' + (clientFixed || '…') + '"' : 'model generates per call'}</span>
          </div>
          <div>
            <span style={{ color: '#7C6EFA', fontWeight: 700 }}>agent_message</span>
            <span style={{ color: '#64748B' }}> (string, required)</span>
            <span style={{ color: '#374151' }}> — {agentMode === 'fixed' ? 'fixed: "' + (agentFixed || '…') + '"' : 'model generates per call'}</span>
          </div>
          <div>
            <span style={{ color: '#7C6EFA', fontWeight: 700 }}>reason</span>
            <span style={{ color: '#64748B' }}> (string, optional)</span>
            <span style={{ color: '#374151' }}> — explanation for the transfer</span>
          </div>
        </div>
      </div>

    </div>
  );
}

function SectionLabel({ label, accent = '#10B981', hint }: { label: string; accent?: string; hint?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4,
    }}>
      <div style={{ width: 4, height: 16, borderRadius: 2, background: `linear-gradient(180deg, ${accent}, ${accent}88)`, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent }}>
        {label}
      </span>
      {hint && <span style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>{hint}</span>}
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}22, transparent)` }} />
    </div>
  );
}

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
  const [createToolType,  setCreateToolType]  = useState<'webhook' | 'client' | 'mcp'>('webhook');
  const [editingTool,     setEditingTool]     = useState<CustomTool | null>(null);
  const [expandedKey,     setExpandedKey]     = useState<string | null>(null);
  const [expandedCustom,  setExpandedCustom]  = useState<string | null>(null);
  const [kbOpen,          setKbOpen]          = useState(false);

  const [toolDescriptions, setToolDescriptions] = useState<Record<string, string>>(_liveToolDescriptions);
  const [toolDefaultConfigs, setToolDefaultConfigs] = useState<Record<string, Record<string, unknown>>>({ ..._liveDefaultConfigs });

  useEffect(() => {
    if (!agentId) return;
    setLoadingCustom(true);
    toolsApi.listCustom(agentId)
      .then((r) => setCustomTools(r.items))
      .catch(() => {})
      .finally(() => setLoadingCustom(false));
  }, [agentId]);

  // Fetch live descriptions + default_configs from backend /catalog once.
  // Also fetch /system-catalog for EL system tool defaults.
  // Backend is single source of truth — these overlay the static fallbacks above.
  useEffect(() => {
    if (_catalogFetched) return;
    _catalogFetched = true;

    const fetchCatalog = toolsApi.catalog().then((items: Array<{ name: string; description: string; default_config?: Record<string, unknown> }>) => {
      const descMap: Record<string, string> = { ..._liveToolDescriptions };
      const cfgMap: Record<string, Record<string, unknown>> = { ..._liveDefaultConfigs };
      items.forEach((t) => {
        descMap[t.name] = t.description;
        if (t.default_config && Object.keys(t.default_config).length > 0) {
          cfgMap[t.name] = t.default_config;
        }
      });
      Object.assign(_liveToolDescriptions, descMap);
      Object.assign(_liveDefaultConfigs, cfgMap);
      setToolDescriptions({ ...descMap });
      setToolDefaultConfigs({ ...cfgMap });
    }).catch(() => {/* keep defaults */});

    const fetchSysCatalog = toolsApi.systemCatalog().then((items) => {
      const cfgMap: Record<string, Record<string, unknown>> = { ..._liveDefaultConfigs };
      items.forEach((t) => {
        if (t.default_config && Object.keys(t.default_config).length > 0) {
          cfgMap[t.key] = t.default_config;
        }
      });
      Object.assign(_liveDefaultConfigs, cfgMap);
      setToolDefaultConfigs((prev) => ({ ...prev, ...cfgMap }));
    }).catch(() => {});

    Promise.allSettled([fetchCatalog, fetchSysCatalog]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open KB panel if KB ID already set (editing existing agent)
  useEffect(() => {
    if (knowledgeBaseId) setKbOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    const willEnable = !enabledTools.includes(id);
    const next = willEnable ? [...enabledTools, id] : enabledTools.filter((t) => t !== id);
    setEnabledTools(next);
    if (willEnable) setExpandedKey(id);
    else if (expandedKey === id) setExpandedKey(null);
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

  // Row for EL Native + Platform Extension tools
  const ToolRow = ({ id, label, desc, color, active, hasConfig, elBadge, children }: {
    id: string; label: string; desc: string; color: string;
    active: boolean; hasConfig: boolean; elBadge?: React.ReactNode; children?: React.ReactNode;
  }) => {
    const expanded = expandedKey === id && active && hasConfig;
    return (
      <div style={{
        background: active ? '#FFFFFF' : '#FAFAFA',
        border: `1px solid ${active ? `${color}33` : '#E8EDF2'}`,
        borderLeft: `3px solid ${active ? color : '#E2E8F0'}`,
        borderRadius: 10, overflow: 'hidden',
        boxShadow: active ? `0 2px 12px ${color}12, 0 1px 3px rgba(0,0,0,0.06)` : '0 1px 2px rgba(0,0,0,0.03)',
        transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
      }}>
        <div
          onClick={() => toggle(id)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 12px 12px', cursor: 'pointer', userSelect: 'none' }}
        >
          {/* Color dot */}
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: active ? `${color}15` : '#F1F5F9',
            border: `1px solid ${active ? `${color}30` : '#E2E8F0'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: active ? color : '#CBD5E1',
              boxShadow: active ? `0 0 6px ${color}88` : 'none',
              transition: 'all 0.2s',
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#0F172A' : '#64748B', marginBottom: 3, transition: 'color 0.2s', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
              {elBadge ?? label}
            </div>
            <div style={{ fontSize: 11, color: active ? '#64748B' : '#94A3B8', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {desc}
            </div>
          </div>
          <ToggleSwitch active={active} color={color} />
          {/* Always reserve chevron space — prevents toggle button jumping left/right */}
          <div
            onClick={(e) => {
              if (!active || !hasConfig) return;
              e.stopPropagation();
              setExpandedKey(expanded ? null : id);
            }}
            style={{
              width: 20, flexShrink: 0, padding: '4px 2px',
              cursor: active && hasConfig ? 'pointer' : 'default',
              color: '#94A3B8',
              opacity: active && hasConfig ? 1 : 0,
              transition: 'opacity 0.18s',
              pointerEvents: active && hasConfig ? 'auto' : 'none',
            }}
          >
            <Chevron open={expanded} />
          </div>
        </div>
        <ExpandPanel open={expanded} color={`${color}04`}>
          {children}
        </ExpandPanel>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Quick-add buttons — pinned to the TOP ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => { setCreateToolType('webhook'); setShowCreateModal(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            background: '#F43F5E', color: '#FFFFFF', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'var(--font-ui), sans-serif', transition: 'all 0.18s',
            boxShadow: '0 2px 6px rgba(244,63,94,0.28)', letterSpacing: '-0.01em',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#E0304A'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(244,63,94,0.38)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F43F5E'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(244,63,94,0.28)'; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Custom Tool
        </button>
        <button
          onClick={() => { setCreateToolType('mcp'); setShowCreateModal(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            background: '#8B5CF6', color: '#FFFFFF', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'var(--font-ui), sans-serif', transition: 'all 0.18s',
            boxShadow: '0 2px 6px rgba(139,92,246,0.28)', letterSpacing: '-0.01em',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#7C3AED'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(139,92,246,0.38)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#8B5CF6'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(139,92,246,0.28)'; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
          </svg>
          MCP Server
        </button>
      </div>

      {/* ── 1. Core Platform Tools ───────────────────────────────────────────── */}
      <div>
        <SectionLabel label="Core Platform Tools" hint="· toggle to include or exclude from agent" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tier1.map((tool) => {
            const active = enabledTools.includes(tool.id);
            const cfg = toolConfigs[tool.id] ?? {};
            return (
              <ToolRow key={tool.id} id={tool.id} label={tool.name} desc={tool.desc}
                color={tool.color} active={active} hasConfig={true}>
                <Tier1DescriptionEditor
                  toolId={tool.id}
                  config={cfg}
                  onChange={(key, val) => updateConfig(tool.id, key, val)}
                  liveDescriptions={toolDescriptions}
                />
              </ToolRow>
            );
          })}
        </div>
      </div>

      {/* ── 2. ElevenLabs Native Tools ──────────────────────────────────────── */}
      <div>
        <SectionLabel label="ElevenLabs Native" accent="#7C6EFA" hint="· handled by EL, no backend callback" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {EL_SYSTEM_TOOLS.map((sys) => {
            const active = enabledTools.includes(sys.key);
            const cfg = (toolConfigs[sys.key] ?? {}) as Record<string, string>;
            // Backend default_config for this system tool (fetched from /system-catalog or static fallback)
            const sysDef = (toolDefaultConfigs[sys.key] ?? DEFAULT_TOOL_CONFIGS[sys.key] ?? {}) as Record<string, unknown>;
            const elLabel = (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                {sys.label}
                <span style={{ background: 'rgba(34,211,238,0.12)', color: '#22D3EE', borderRadius: 4, padding: '2px 6px', fontSize: 11, marginLeft: 8 }}>EL Native</span>
              </span>
            );
            return (
              <ToolRow key={sys.key} id={sys.key} label={sys.label} desc={sys.desc}
                elBadge={elLabel} color={sys.color} active={active} hasConfig={sys.hasConfig}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* EL Transfer config */}
                  {sys.key === 'el_transfer_to_number' && (
                    <ELTransferConfig sysKey={sys.key} cfg={cfg as Record<string, unknown>} updateSysConfig={updateSysConfig} />
                  )}
                  {/* Advanced: disable_interruptions + error handling — all EL system tools */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <GLabel>Disable Interruptions</GLabel>
                      <GSelect
                        value={cfg.disable_interruptions ?? String(sysDef.disable_interruptions ?? 'false')}
                        onChange={(e) => updateSysConfig(sys.key, 'disable_interruptions', e.target.value)}
                      >
                        <option value="false">No — allow interruptions</option>
                        <option value="true">Yes — block interruptions</option>
                      </GSelect>
                    </div>
                    <div>
                      <GLabel>On Error</GLabel>
                      <GSelect
                        value={cfg.tool_error_handling_mode ?? String(sysDef.tool_error_handling_mode ?? 'auto')}
                        onChange={(e) => updateSysConfig(sys.key, 'tool_error_handling_mode', e.target.value)}
                      >
                        <option value="auto">Auto — agent handles gracefully</option>
                        <option value="fail">Fail — end call on error</option>
                        <option value="ignore">Ignore — continue silently</option>
                      </GSelect>
                    </div>
                  </div>
                  {/* Description override for all EL system tools */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Custom Description</span>
                      {cfg.description ? (
                        <button onClick={() => updateSysConfig(sys.key, 'description', '')}
                          style={{ fontSize: 10.5, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                          Reset to default
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>leave blank to keep default</span>
                      )}
                    </div>
                    <textarea
                      value={cfg.description || ''}
                      onChange={(e) => updateSysConfig(sys.key, 'description', e.target.value)}
                      placeholder={sys.desc}
                      rows={3}
                      style={{
                        background: '#FFFFFF', border: '1px solid #E2E8F0',
                        color: '#334155', borderRadius: 9, padding: '9px 12px', fontSize: 13,
                        minHeight: 60, resize: 'vertical', width: '100%', outline: 'none',
                        lineHeight: 1.65, fontFamily: 'var(--font-ui), sans-serif', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </ToolRow>
            );
          })}
        </div>
      </div>

      {/* ── 3. Platform Extension Tools (Tier 2) ────────────────────────────── */}
      <div>
        <SectionLabel label="Platform Tools" accent="#38BDF8" hint="· optional, server-side execution" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tier2.map((tool) => {
            const active = enabledTools.includes(tool.id);
            const cfg = toolConfigs[tool.id] ?? {};
            const voxaraBadge = tool.id === 'transfer_to_human' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                {tool.name}
                <span style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', borderRadius: 4, padding: '2px 6px', fontSize: 11, marginLeft: 8 }}>Voxara Custom</span>
              </span>
            ) : undefined;
            return (
              <ToolRow key={tool.id} id={tool.id} label={tool.name} desc={tool.desc}
                elBadge={voxaraBadge}
                color={tool.color} active={active} hasConfig={true}>
                <ToolConfigPanel tool={tool} config={cfg} onChange={(key, val) => updateConfig(tool.id, key, val)} liveDescriptions={toolDescriptions} defaultConfig={toolDefaultConfigs[tool.id] ?? DEFAULT_TOOL_CONFIGS[tool.id] ?? {}} />
              </ToolRow>
            );
          })}
        </div>
      </div>

      {/* ── 4. Knowledge Base ────────────────────────────────────────────────── */}
      <div>
        <SectionLabel label="Knowledge Base" accent="#10B981" hint="· ElevenLabs native KB attachment" />
        <div style={{
          background: kbActive ? '#FFFFFF' : '#FAFAFA',
          border: `1px solid ${kbActive ? 'rgba(16,185,129,0.33)' : '#E8EDF2'}`,
          borderLeft: `3px solid ${kbActive ? '#10B981' : '#E2E8F0'}`,
          borderRadius: 10, overflow: 'hidden',
          boxShadow: kbActive ? '0 2px 12px rgba(16,185,129,0.1), 0 1px 3px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.03)',
          transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
        }}>
          {/* Toggle row */}
          <div
            onClick={() => setKbOpen((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 12px 12px', cursor: 'pointer', userSelect: 'none' }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: kbActive ? 'rgba(16,185,129,0.12)' : '#F1F5F9',
              border: `1px solid ${kbActive ? 'rgba(16,185,129,0.25)' : '#E2E8F0'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: kbActive ? '#10B981' : '#CBD5E1',
                boxShadow: kbActive ? '0 0 6px rgba(16,185,129,0.6)' : 'none',
                transition: 'all 0.2s',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: kbActive ? '#0F172A' : '#64748B', transition: 'color 0.2s' }}>
                  {kbActive ? (knowledgeBaseName || 'Knowledge Base') : 'Knowledge Base'}
                </span>
                {kbActive && (
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#10B981', background: 'rgba(16,185,129,0.15)', padding: '2px 6px', borderRadius: 9999 }}>
                    Connected
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: '#94A3B8', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {kbActive ? `ID: ${knowledgeBaseId}` : 'Connect an EL Knowledge Base — the agent queries it during calls'}
              </div>
            </div>
            {/* KB toggle — clicking disconnects if active */}
            <div
              onClick={(e) => { e.stopPropagation(); if (kbActive) { setKnowledgeBaseId(''); setKnowledgeBaseName(''); setKbOpen(false); } else setKbOpen(true); }}
            >
              <ToggleSwitch active={kbActive} color="#10B981" />
            </div>
            <div style={{ color: '#94A3B8', padding: '2px' }}>
              <Chevron open={kbOpen} />
            </div>
          </div>

          <ExpandPanel open={kbOpen} color="rgba(16,185,129,0.03)">
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
                <GInput value={knowledgeBaseName} onChange={(e) => setKnowledgeBaseName(e.target.value)} placeholder="Product Docs, FAQs, etc." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 8, padding: '9px 11px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ fontSize: 10.5, color: '#94A3B8', lineHeight: 1.6 }}>
                Create KBs and upload documents (PDF, DOCX, TXT, URLs) in your <span style={{ color: '#10B981' }}>ElevenLabs dashboard → Conversational AI → Knowledge Bases</span>. Paste the KB ID above.
              </span>
            </div>
          </ExpandPanel>
        </div>
      </div>

      {/* ── 5. Custom Tools & MCP ────────────────────────────────────────────── */}
      <div>
        <SectionLabel label="Custom Tools & MCP" accent="#F0B429" hint={`· ${customTools.length} created`} />

        {loadingCustom ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 0', color: '#94A3B8', fontSize: 12 }}>
            <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #E2E8F0', borderTopColor: '#F0B429', animation: 'ab-spin 0.7s linear infinite' }} />
            Loading custom tools…
          </div>
        ) : customTools.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '24px 0',
            border: '1px dashed rgba(240,180,41,0.12)', borderRadius: 10,
            color: '#94A3B8', fontSize: 12,
          }}>
            No custom tools yet. Create a webhook, client, or MCP tool to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {customTools.map((ct) => {
              const typeColor = ct.el_tool_type === 'webhook' ? '#22D3EE' : ct.el_tool_type === 'client' ? '#7C6EFA' : '#A89AF9';
              const open = expandedCustom === ct.id;
              return (
                <div key={ct.id} style={{
                  background: open ? '#FFFFFF' : '#FAFAFA',
                  border: `1px solid ${open ? `${typeColor}30` : '#E8EDF2'}`,
                  borderLeft: `3px solid ${open ? typeColor : '#E2E8F0'}`,
                  borderRadius: 10, overflow: 'hidden', opacity: ct.is_active ? 1 : 0.45,
                  boxShadow: open ? `0 2px 10px ${typeColor}10, 0 1px 3px rgba(0,0,0,0.05)` : '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s',
                }}>
                  <div
                    onClick={() => setExpandedCustom(open ? null : ct.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 12px 12px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: `${typeColor}12`,
                      border: `1px solid ${typeColor}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: typeColor }}>
                        {ct.el_tool_type === 'webhook' ? 'WH' : ct.el_tool_type === 'client' ? 'CL' : 'MCP'}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ct.name}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180, flexShrink: 1 }}>
                      {ct.description}
                    </span>
                    <Chevron open={open} />
                  </div>
                  <ExpandPanel open={open} color={`${typeColor}04`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8, lineHeight: 1.6 }}>{ct.description}</div>
                        {ct.el_tool_type === 'webhook' && (ct.config as Record<string, string>)?.url && (
                          <div style={{ fontSize: 10.5, color: '#64748B', fontFamily: 'var(--font-mono)', background: '#F8FAFC', padding: '4px 8px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(ct.config as Record<string, string>).method ?? 'POST'} {(ct.config as Record<string, string>).url}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setEditingTool(ct)} style={{
                          padding: '5px 12px', borderRadius: 7,
                          border: `1px solid ${typeColor}30`, background: `${typeColor}08`, color: typeColor,
                          fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
                        }}>Edit</button>
                        <button onClick={() => handleDeleteTool(ct)} style={{
                          padding: '5px 12px', borderRadius: 7,
                          border: '1px solid rgba(255,77,109,0.22)', background: 'rgba(255,77,109,0.05)',
                          color: '#FF4D6D', fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
                        }}>Delete</button>
                      </div>
                    </div>
                  </ExpandPanel>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && <CreateToolModal agentId={agentId} initialType={createToolType} onSave={handleCreateTool} onClose={() => setShowCreateModal(false)} />}
      {editingTool && <CreateToolModal agentId={agentId} editTool={editingTool} onSave={handleUpdateTool} onClose={() => setEditingTool(null)} />}
    </div>
  );
}

function ToolConfigPanel({ tool, config, onChange, liveDescriptions, defaultConfig = {} }: {
  tool: typeof BUILTIN_TOOLS[number]; config: Record<string, string>; onChange: (key: string, val: string) => void;
  liveDescriptions?: Record<string, string>;
  defaultConfig?: Record<string, unknown>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Description — pre-populated with default, user can override */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Custom Description</span>
          {config.description ? (
            <button
              onClick={() => onChange('description', '')}
              style={{ fontSize: 10.5, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, textDecoration: 'underline', textDecorationStyle: 'dotted' }}
            >
              Reset to default
            </button>
          ) : (
            <span style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>leave blank to keep default</span>
          )}
        </div>
        <textarea
          value={config.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder={(liveDescriptions?.[tool.id]) || DEFAULT_TOOL_DESCRIPTIONS[tool.id] || tool.desc}
          rows={3}
          style={{
            background: '#FFFFFF', border: '1px solid #E2E8F0',
            color: '#334155', borderRadius: 9, padding: '9px 12px', fontSize: 13,
            minHeight: 60, resize: 'vertical', width: '100%', outline: 'none',
            lineHeight: 1.65, fontFamily: 'var(--font-ui), sans-serif', boxSizing: 'border-box',
          }}
        />
      </div>

      {tool.id === 'book_meeting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: '#F0B429', background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.2)', borderRadius: 7, padding: '7px 10px' }}>
            Calendar integration is in development. Config is saved and will activate when the integration ships.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <GLabel>Calendar provider</GLabel>
              <GSelect value={config.calendar_provider ?? String(defaultConfig.calendar_provider ?? 'cal.com')} onChange={(e) => onChange('calendar_provider', e.target.value)}>
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
        </div>
      )}

      {tool.id === 'send_followup_sms' && (
        <div>
          <GLabel hint="— {{lead_first_name}}, {{company_name}}">Message template</GLabel>
          <GTextarea value={config.message_template ?? ''} onChange={(e) => onChange('message_template', e.target.value)} rows={3} placeholder={String(defaultConfig.message_template ?? DEFAULT_TOOL_CONFIGS.send_followup_sms?.message_template ?? 'Thank you for your time today!')} />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
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
          <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)', padding: '7px 10px', background: '#F8FAFC', borderRadius: 7, border: '1px solid #F1F5F9' }}>
            CRM Lookup and CRM Update share credentials.
          </div>
        </div>
      )}

      {tool.id === 'lookup_product_info' && (
        <div>
          <GLabel hint="— JSON array">Product Catalog</GLabel>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            JSON array of product objects. The agent searches this catalog when asked about products or pricing.
          </div>
          <GTextarea
            value={config.catalog_json ?? ''}
            onChange={(e) => onChange('catalog_json', e.target.value)}
            rows={6}
            placeholder={`[\n  { "name": "Pro Plan", "price": "$99/mo", "features": "Unlimited calls, CRM sync" },\n  { "name": "Starter", "price": "$29/mo", "features": "100 calls/month" }\n]`}
          />
        </div>
      )}

      {tool.id === 'qualify_lead' && (
        <div>
          <GLabel hint="— JSON object">Qualification Criteria</GLabel>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            JSON object where each key is a criteria identifier and the value is the question or requirement. The agent scores the lead based on how many criteria are met.
          </div>
          <GTextarea
            value={config.criteria_json ?? ''}
            onChange={(e) => onChange('criteria_json', e.target.value)}
            rows={5}
            placeholder={`{\n  "has_budget": "Does the contact have budget allocated?",\n  "decision_maker": "Is the contact the decision maker?",\n  "timeline": "Does the contact have a purchase timeline within 3 months?"\n}`}
          />
        </div>
      )}

      {tool.id === 'transfer_to_human' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <GLabel>Transfer-to number (E.164)</GLabel>
              <GInput value={config.transfer_to ?? ''} onChange={(e) => onChange('transfer_to', e.target.value)} placeholder="+15551234567" />
            </div>
            <div>
              <GLabel>Transfer mode</GLabel>
              <GSelect value={config.mode ?? String(defaultConfig.mode ?? 'cold')} onChange={(e) => onChange('mode', e.target.value)}>
                <option value="cold">Cold — immediate handoff</option>
                <option value="warm">Warm — agent stays briefly</option>
              </GSelect>
            </div>
          </div>
          <div>
            <GLabel hint="— outcome label saved for this call after transfer">Post-transfer outcome</GLabel>
            <GSelect value={config.post_transfer_outcome ?? 'transferred_to_human'} onChange={(e) => onChange('post_transfer_outcome', e.target.value)}>
              <option value="transferred_to_human">Transferred to Human</option>
              <option value="goal_achieved">Goal Achieved</option>
              <option value="issue_resolved">Issue Resolved</option>
              <option value="interested">Interested</option>
              <option value="callback_requested">Callback Requested</option>
              <option value="follow_up_needed">Follow-up Needed</option>
              <option value="not_interested">Not Interested</option>
              <option value="call_disconnected">Call Disconnected</option>
            </GSelect>
          </div>
          <div>
            <GLabel hint="— spoken to caller when connecting">Connecting message</GLabel>
            <GInput
              value={config.connecting_message ?? ''}
              onChange={(e) => onChange('connecting_message', e.target.value)}
              placeholder={String(defaultConfig.connecting_message ?? DEFAULT_TOOL_CONFIGS.transfer_to_human?.connecting_message ?? '')}
            />
          </div>
          <div>
            <GLabel hint="— spoken when no number is configured">Unavailable message</GLabel>
            <GTextarea
              value={config.unavailable_message ?? ''}
              onChange={(e) => onChange('unavailable_message', e.target.value)}
              rows={2}
              placeholder={String(defaultConfig.unavailable_message ?? DEFAULT_TOOL_CONFIGS.transfer_to_human?.unavailable_message ?? '')}
            />
          </div>
          <div>
            <GLabel hint="— spoken when Twilio redirect fails">Transfer failed message</GLabel>
            <GTextarea
              value={config.transfer_failed_message ?? ''}
              onChange={(e) => onChange('transfer_failed_message', e.target.value)}
              rows={2}
              placeholder={String(defaultConfig.transfer_failed_message ?? DEFAULT_TOOL_CONFIGS.transfer_to_human?.transfer_failed_message ?? '')}
            />
          </div>
        </div>
      )}

      {tool.id === 'leave_voicemail' && (
        <div>
          <GLabel hint="— {{company_name}}, {{lead_first_name}}">Voicemail message</GLabel>
          <GTextarea value={config.default_message ?? ''} onChange={(e) => onChange('default_message', e.target.value)} rows={3} placeholder={String(defaultConfig.default_message ?? DEFAULT_TOOL_CONFIGS.leave_voicemail?.default_message ?? '')} />
        </div>
      )}
    </div>
  );
}

// ─── Voice tab ────────────────────────────────────────────────────────────────
const TTS_MODELS = [
  { id: 'eleven_v3_conversational', label: 'Eleven v3 Conversational', badge: 'LATEST', desc: 'Most natural · Highest quality · Recommended for all calls',      color: '#10B981' },
  { id: 'eleven_flash_v2',          label: 'Flash v2',                 badge: 'FAST',   desc: 'Ultra-low latency (~75ms) · English only · Best for speed',       color: '#38BDF8' },
  { id: 'eleven_multilingual_v2',   label: 'Multilingual v2',          badge: 'MULTI',  desc: 'Best for non-English calls · Supports 29 languages',               color: '#A89AF9' },
];

const STT_PROVIDERS = [
  { id: 'elevenlabs',     label: 'ElevenLabs Native', badge: 'DEFAULT',  desc: 'Reliable · Battle-tested · Low latency',                    color: '#10B981' },
  { id: 'scribe_v2',     label: 'Scribe v2',          badge: 'ACCURATE', desc: 'Highest accuracy · Best for complex accents',               color: '#38BDF8' },
  { id: 'scribe_v2_turbo', label: 'Scribe v2 Turbo',  badge: 'FASTEST',  desc: 'Lowest latency · Slightly less accurate than Scribe v2',   color: '#F0B429' },
  { id: 'scribe_realtime', label: 'Scribe Realtime',   badge: 'STREAM',   desc: 'Real-time streaming · Good for long pauses & noisy lines', color: '#A89AF9' },
];

function VoiceTab({ voices, selectedVoice, setSelectedVoice, ttsModel, setTtsModel, sttProvider, setSttProvider }: {
  voices: Array<{ voice_id: string; name: string }>; selectedVoice: number; setSelectedVoice: (i: number) => void;
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
                border: `1px solid ${genderFilter === g ? '#10B981' : '#E2E8F0'}`,
                background: genderFilter === g ? 'rgba(0,208,130,0.1)' : 'transparent',
                color: genderFilter === g ? '#10B981' : 'var(--text-muted)',
              }}>
                {g === 'all' ? 'All voices' : g === 'female' ? '♀ Female' : '♂ Male'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filtered.length} voices
            {voices.length > 0 && <span style={{ color: '#10B981', marginLeft: 6 }}>· {voices.length} from your EL library</span>}
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
                  background: active ? 'rgba(16,185,129,0.06)' : '#FAFAFA',
                  borderRadius: 10, padding: '11px 14px', cursor: 'pointer',
                  border: `1px solid ${active ? '#10B981' : '#E2E8F0'}`,
                  boxShadow: active ? '0 0 0 rgba(0,0,0,0)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.18s',
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? '#CBD5E1' : '#F8FAFC',
                  border: `1px solid ${active ? '#10B981' : '#E2E8F0'}`,
                  transition: 'all 0.18s',
                }}>
                  <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
                    {[3, 7, 11, 7, 3].map((h, j) => (
                      <div key={j} style={{
                        width: 2, height: h, borderRadius: 1,
                        background: active ? '#10B981' : '#CBD5E1',
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
                {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #00D082', flexShrink: 0 }} />}
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
              background: customId.trim() ? 'rgba(56,189,248,0.12)' : '#F8FAFC',
              border: `1px solid ${customId.trim() ? '#38BDF8' : '#E2E8F0'}`,
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
                background: active ? 'rgba(16,185,129,0.06)' : '#FAFAFA',
                border: `1px solid ${active ? '#10B981' : '#E2E8F0'}`,
                borderRadius: 10, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.18s',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: active ? m.color : '#CBD5E1',
                  boxShadow: active ? `0 0 8px ${m.color}` : 'none',
                  transition: 'all 0.18s',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#0F172A' : 'var(--text-muted)' }}>{m.label}</span>
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
                background: active ? 'rgba(56,189,248,0.06)' : '#FAFAFA',
                border: `1px solid ${active ? '#38BDF8' : '#E2E8F0'}`,
                borderRadius: 10, padding: '12px 16px', cursor: 'pointer', transition: 'all 0.18s',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: active ? s.color : '#CBD5E1',
                  boxShadow: active ? `0 0 8px ${s.color}` : 'none',
                  transition: 'all 0.18s',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#0F172A' : 'var(--text-muted)' }}>{s.label}</span>
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

    </div>
  );
}

// ─── Script tab ───────────────────────────────────────────────────────────────
const SCRIPT_SECTIONS = [
  { key: 'opener',    label: 'Opener',            icon: '💬', placeholder: 'Initial greeting and purpose of the call…',        accent: '#10B981' },
  { key: 'discovery', label: 'Discovery',          icon: '🔍', placeholder: "Questions to understand the prospect's needs…",   accent: '#38BDF8' },
  { key: 'pitch',     label: 'Pitch',              icon: '✨', placeholder: 'How to present your product or service…',          accent: '#A89AF9' },
  { key: 'objection', label: 'Objection Handling', icon: '🛡', placeholder: 'How to handle common objections…',                 accent: '#F0B429' },
  { key: 'closing',   label: 'Closing',            icon: '🎯', placeholder: 'How to close or schedule next steps…',             accent: '#06B6D4' },
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
        <code style={{ fontSize: 10.5, color: '#10B981', background: 'rgba(0,208,130,0.1)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
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
              background: '#FFFFFF', backdropFilter: 'none',
              border: `1px solid ${hasContent ? `${s.accent}25` : '#E2E8F0'}`,
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
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F1F5F9', animation: 'ab-fade-in 0.2s both' }}>
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

// ─── Tier1 description + optional config editor ───────────────────────────────
function Tier1DescriptionEditor({ toolId, config, onChange, liveDescriptions }: {
  toolId: string; config: Record<string, string>; onChange: (key: string, val: string) => void;
  liveDescriptions: Record<string, string>;
}) {
  const taStyle: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #E2E8F0',
    color: '#334155', borderRadius: 9, padding: '9px 12px', fontSize: 13,
    resize: 'vertical', width: '100%', outline: 'none', lineHeight: 1.65,
    fontFamily: 'var(--font-ui), sans-serif', boxSizing: 'border-box',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Description override */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Custom Description</span>
          {config.description ? (
            <button onClick={() => onChange('description', '')}
              style={{ fontSize: 10.5, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
              Reset to default
            </button>
          ) : (
            <span style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>leave blank to keep default</span>
          )}
        </div>
        <textarea
          value={config.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder={liveDescriptions[toolId] || DEFAULT_TOOL_DESCRIPTIONS[toolId] || 'Enter a custom description...'}
          rows={3}
          style={taStyle}
        />
      </div>

      {/* log_call_outcome — custom outcome values */}
      {toolId === 'log_call_outcome' && (
        <div>
          <GLabel hint="— comma-separated or JSON array">Custom Outcome Values</GLabel>
          <div style={{ color: '#64748B', fontSize: 11, marginBottom: 6 }}>
            Override the allowed outcome options the AI can log. Leave blank to use the defaults
            (goal_achieved, interested, not_interested, voicemail_left, etc.).
          </div>
          <GTextarea
            value={config.custom_outcomes ?? ''}
            onChange={(e) => onChange('custom_outcomes', e.target.value)}
            rows={3}
            placeholder={'goal_achieved, interested, demo_scheduled, callback_requested, not_interested, do_not_call'}
          />
        </div>
      )}

      {/* update_call_stage — custom stage values */}
      {toolId === 'update_call_stage' && (
        <div>
          <GLabel hint="— comma-separated or JSON array">Custom Stage Values</GLabel>
          <div style={{ color: '#64748B', fontSize: 11, marginBottom: 6 }}>
            Override the allowed stage options for your conversation flow. Leave blank for defaults
            (intro, discovery, pitch, objection, closing, follow_up).
          </div>
          <GTextarea
            value={config.custom_stages ?? ''}
            onChange={(e) => onChange('custom_stages', e.target.value)}
            rows={2}
            placeholder={'intro, discovery, pitch, objection, closing, follow_up'}
          />
        </div>
      )}

      {/* get_call_script — custom section names */}
      {toolId === 'get_call_script' && (
        <div>
          <GLabel hint="— comma-separated or JSON array">Custom Section Names</GLabel>
          <div style={{ color: '#64748B', fontSize: 11, marginBottom: 6 }}>
            Define the sections the AI can retrieve from your product/service details or playbook.
            Leave blank for defaults (opener, discovery, pitch, objection_handling, closing, faq).
          </div>
          <GTextarea
            value={config.custom_sections ?? ''}
            onChange={(e) => onChange('custom_sections', e.target.value)}
            rows={2}
            placeholder={'opener, discovery, pitch, objection_handling, closing, faq'}
          />
        </div>
      )}
    </div>
  );
}

// ─── Analysis tab ─────────────────────────────────────────────────────────────
function AnalysisTab({
  evaluationCriteria, setEvaluationCriteria, dataCollection, setDataCollection,
}: {
  evaluationCriteria: Array<{ id: string; name: string; conversation_goal_prompt: string; scope: 'conversation' | 'agent' }>;
  setEvaluationCriteria: (v: Array<{ id: string; name: string; conversation_goal_prompt: string; scope: 'conversation' | 'agent' }>) => void;
  dataCollection: Array<{ id: string; name: string; type: 'string' | 'boolean' | 'number' | 'enum'; description: string }>;
  setDataCollection: (v: Array<{ id: string; name: string; type: 'string' | 'boolean' | 'number' | 'enum'; description: string }>) => void;
}) {
  function addCriterion() {
    setEvaluationCriteria([
      ...evaluationCriteria,
      { id: `crit_${Date.now()}`, name: '', conversation_goal_prompt: '', scope: 'conversation' },
    ]);
  }

  function removeCriterion(id: string) {
    setEvaluationCriteria(evaluationCriteria.filter((c) => c.id !== id));
  }

  function updateCriterion(id: string, key: string, value: string) {
    setEvaluationCriteria(evaluationCriteria.map((c) => c.id === id ? { ...c, [key]: value } : c));
  }

  function addField() {
    setDataCollection([
      ...dataCollection,
      { id: `field_${Date.now()}`, name: '', type: 'string', description: '' },
    ]);
  }

  function removeField(id: string) {
    setDataCollection(dataCollection.filter((f) => f.id !== id));
  }

  function updateField(id: string, key: string, value: string) {
    setDataCollection(dataCollection.map((f) => f.id === id ? { ...f, [key]: value } : f));
  }

  const cardStyle: React.CSSProperties = {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 10,
  };

  const inputStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    color: '#1E293B',
    padding: '8px 10px',
    fontSize: 13,
    width: '100%',
    outline: 'none',
    fontFamily: 'var(--font-ui), sans-serif',
    boxSizing: 'border-box',
  };

  const addBtnStyle: React.CSSProperties = {
    background: 'rgba(124,110,250,0.10)',
    color: '#7C6EFA',
    border: '1px solid rgba(124,110,250,0.25)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'var(--font-ui), sans-serif',
  };

  const removeBtnStyle: React.CSSProperties = {
    background: 'rgba(239,68,68,0.08)',
    color: '#EF4444',
    border: '1px solid rgba(239,68,68,0.15)',
    borderRadius: 4,
    padding: '2px 6px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-ui), sans-serif',
    flexShrink: 0,
  };

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Section 1: Success Evaluation Criteria */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: '0 0 6px 0', fontFamily: 'var(--font-ui), sans-serif' }}>
            Success Evaluation Criteria
          </h3>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0, lineHeight: 1.55 }}>
            Define goals ElevenLabs will evaluate after every call. Each criterion gets a result: Success, Failure, or Unknown.
          </p>
        </div>

        {evaluationCriteria.map((crit) => (
          <div key={crit.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 5, fontFamily: 'var(--font-ui), sans-serif' }}>Criterion Name</div>
                <input
                  value={crit.name}
                  onChange={(e) => updateCriterion(crit.id, 'name', e.target.value)}
                  placeholder="e.g. Appointment Booked"
                  style={inputStyle}
                />
              </div>
              <button onClick={() => removeCriterion(crit.id)} style={{ ...removeBtnStyle, marginTop: 22 }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 5, fontFamily: 'var(--font-ui), sans-serif' }}>Goal Prompt</div>
              <textarea
                value={crit.conversation_goal_prompt}
                onChange={(e) => updateCriterion(crit.id, 'conversation_goal_prompt', e.target.value)}
                placeholder="e.g. Did the agent successfully book an appointment?"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6, fontFamily: 'var(--font-ui), sans-serif' }}>Scope</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['conversation', 'agent'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => updateCriterion(crit.id, 'scope', scope)}
                    style={{
                      padding: '4px 12px', borderRadius: 9999, fontSize: 12, cursor: 'pointer',
                      fontFamily: 'var(--font-ui), sans-serif',
                      background: crit.scope === scope ? 'rgba(124,110,250,0.10)' : '#F8FAFC',
                      border: `1px solid ${crit.scope === scope ? 'rgba(124,110,250,0.35)' : '#E2E8F0'}`,
                      color: crit.scope === scope ? '#7C6EFA' : '#64748B',
                      transition: 'all 0.15s',
                    }}
                  >
                    {scope === 'conversation' ? 'Full Conversation' : 'Agent Turn Only'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

        <button onClick={addCriterion} style={addBtnStyle}>+ Add Criterion</button>
      </div>

      {/* Section 2: Data Collection */}
      <div>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: '0 0 6px 0', fontFamily: 'var(--font-ui), sans-serif' }}>
            Data Collection
          </h3>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0, lineHeight: 1.55 }}>
            Fields ElevenLabs will automatically extract from every conversation transcript.
          </p>
        </div>

        {dataCollection.map((field) => (
          <div key={field.id} style={cardStyle}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 120 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 5, fontFamily: 'var(--font-ui), sans-serif' }}>Field Name</div>
                <input
                  value={field.name}
                  onChange={(e) => updateField(field.id, 'name', e.target.value)}
                  placeholder="e.g. contact_email"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 5, fontFamily: 'var(--font-ui), sans-serif' }}>Type</div>
                <select
                  value={field.type}
                  onChange={(e) => updateField(field.id, 'type', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="string">string</option>
                  <option value="boolean">boolean</option>
                  <option value="number">number</option>
                  <option value="enum">enum</option>
                </select>
              </div>
              <div style={{ flex: 3, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 5, fontFamily: 'var(--font-ui), sans-serif' }}>Description</div>
                <input
                  value={field.description}
                  onChange={(e) => updateField(field.id, 'description', e.target.value)}
                  placeholder="e.g. Email address the contact mentioned"
                  style={inputStyle}
                />
              </div>
              <button onClick={() => removeField(field.id)} style={{ ...removeBtnStyle, marginBottom: 1 }}>✕</button>
            </div>
          </div>
        ))}

        <button onClick={addField} style={addBtnStyle}>+ Add Field</button>
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
                  background: active ? `rgba(${m.color === '#4285F4' ? '66,133,244' : m.color === '#10A37F' ? '16,163,127' : '230,116,42'},0.06)` : '#FAFAFA',
                  border: `1px solid ${active ? `${m.color}45` : '#E2E8F0'}`,
                  borderLeft: `3px solid ${active ? m.color : '#E2E8F0'}`,
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
        <strong style={{ color: '#10B981' }}>Tip:</strong> Settings are synced to ElevenLabs on every Save.
        Use <strong style={{ color: 'var(--text-secondary)' }}>Sync to EL</strong> only if a previous sync failed or the agent was modified externally.
        Active calls are never affected mid-session.
      </div>
    </div>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────
function GSlider({ label, hint, value, onChange, min, max, step, fmt, color = '#10B981' }: {
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
      <div style={{ position: 'relative', height: 5, background: '#F8FAFC', borderRadius: 9999, marginBottom: 6 }}>
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
          border: '2px solid #FFFFFF',
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
