'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { CustomToolCreate, ToolParameter, HeaderPair, QueryParam } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ToolType = 'webhook' | 'client' | 'mcp';

interface Props {
  agentId: string;
  editTool?: {
    id: string;
    el_tool_type: ToolType;
    name: string;
    description: string;
    parameters_schema: Record<string, unknown>;
    tool_parameters: ToolParameter[];
    config: Record<string, unknown>;
    disable_interruptions: boolean;
    execution_mode: string;
    pre_tool_speech: string;
    expects_response: boolean;
    response_timeout_secs: number;
  };
  onSave: (data: CustomToolCreate) => Promise<void>;
  onClose: () => void;
}

// ── Animations ────────────────────────────────────────────────────────────────

const MODAL_STYLES = `
  @keyframes ctm-backdrop { from{opacity:0} to{opacity:1} }
  @keyframes ctm-slide-up { from{opacity:0;transform:translateY(24px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes ctm-tab-in   { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:translateX(0)} }
  @keyframes ctm-row-in   { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ctm-spin     { to{transform:rotate(360deg)} }
  @keyframes ctm-pulse    { 0%,100%{opacity:1} 50%{opacity:0.5} }
`;

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  bg0:     '#080B14',
  bg1:     '#0C1120',
  bg2:     '#0F1623',
  bg3:     '#111827',
  green:   '#00D082',
  greenD:  '#00C2B8',
  purple:  '#7C6EFA',
  purpleL: '#A89AF9',
  cyan:    '#22D3EE',
  red:     '#FF4D6D',
  yellow:  '#F0B429',
  border:  'rgba(255,255,255,0.07)',
  borderH: 'rgba(255,255,255,0.13)',
  textP:   'rgba(255,255,255,0.92)',
  textS:   'rgba(255,255,255,0.60)',
  textM:   'rgba(255,255,255,0.38)',
};

const TYPE_META: Record<ToolType, { label: string; color: string; icon: React.ReactElement; desc: string }> = {
  webhook: {
    label: 'Webhook Tool',
    color: T.cyan,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6"/>
      </svg>
    ),
    desc: 'ElevenLabs POSTs to your URL when the agent calls this tool',
  },
  client: {
    label: 'Client Tool',
    color: T.purple,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    desc: 'Fires a browser-side event; no HTTP request to your server',
  },
  mcp: {
    label: 'MCP Tool',
    color: T.purpleL,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
      </svg>
    ),
    desc: 'Proxied through Voxara to your Model Context Protocol server',
  },
};

// ── Form primitives ───────────────────────────────────────────────────────────

function FInput({ value, onChange, placeholder, type = 'text', error, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; error?: boolean; style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  const accent = error ? T.red : focused ? T.green : T.border;
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={type === 'password' ? 'new-password' : 'off'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        background: T.bg0,
        border: `1px solid ${accent}`,
        borderRadius: 8,
        padding: '8px 11px',
        fontSize: 12.5,
        color: T.textP,
        fontFamily: 'Inter, sans-serif',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s',
        boxShadow: focused ? `0 0 0 3px ${error ? T.red : T.green}12` : 'none',
        ...style,
      }}
    />
  );
}

function FTextarea({ value, onChange, placeholder, rows = 3, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
  style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        background: T.bg0,
        border: `1px solid ${focused ? T.green : T.border}`,
        borderRadius: 8,
        padding: '8px 11px',
        fontSize: 12.5,
        color: T.textP,
        fontFamily: 'Inter, sans-serif',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        resize: 'vertical',
        lineHeight: 1.6,
        transition: 'border-color 0.15s',
        boxShadow: focused ? `0 0 0 3px ${T.green}12` : 'none',
        ...style,
      }}
    />
  );
}

function FSelect({ value, onChange, children, style }: {
  value: string; onChange: (v: string) => void;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        background: T.bg0,
        border: `1px solid ${focused ? T.green : T.border}`,
        borderRadius: 8,
        padding: '8px 11px',
        fontSize: 12.5,
        color: T.textP,
        fontFamily: 'Inter, sans-serif',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function FLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
      textTransform: 'uppercase', color: T.textM, marginBottom: 6,
    }}>
      {children}
      {hint && (
        <span style={{
          fontSize: 9.5, fontWeight: 400, letterSpacing: 0,
          textTransform: 'none', color: T.textM, opacity: 0.7,
        }}>{hint}</span>
      )}
    </label>
  );
}

function FToggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onChange(!value)}
    >
      <div style={{
        width: 34, height: 18, borderRadius: 9999, position: 'relative',
        background: value ? `${T.green}30` : 'rgba(255,255,255,0.06)',
        border: `1px solid ${value ? `${T.green}50` : T.border}`,
        transition: 'all 0.2s', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 16 : 3,
          width: 10, height: 10, borderRadius: '50%',
          background: value ? T.green : 'rgba(255,255,255,0.25)',
          transition: 'left 0.2s, background 0.2s',
          boxShadow: value ? `0 0 6px ${T.green}` : 'none',
        }} />
      </div>
      <span style={{ fontSize: 12.5, color: T.textS }}>{label}</span>
    </div>
  );
}

function AddBtn({ onClick, label, color = T.green }: { onClick: () => void; label: string; color?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 7,
        border: `1px dashed ${hov ? color : `${color}50`}`,
        background: hov ? `${color}08` : 'transparent',
        color: hov ? color : `${color}80`,
        fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {label}
    </button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '4px 6px', borderRadius: 6,
        border: `1px solid ${hov ? `${T.red}50` : T.border}`,
        background: hov ? `${T.red}10` : 'transparent',
        color: hov ? T.red : T.textM,
        cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  );
}

function SectionDivider({ label, color = T.green }: { label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px' }}>
      <div style={{ width: 18, height: 1.5, background: `linear-gradient(90deg, ${color}, transparent)`, borderRadius: 2 }} />
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase', color, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}20, transparent)` }} />
    </div>
  );
}

// ── Webhook form ──────────────────────────────────────────────────────────────

function WebhookForm({ config, onChange }: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const url        = (config.url as string)          ?? '';
  const method     = (config.method as string)       ?? 'POST';
  const headers    = (config.headers as HeaderPair[]) ?? [];
  const bodyParams = (config.body_params as QueryParam[]) ?? [];
  const queryParams = (config.query_params as QueryParam[]) ?? [];
  const authType   = ((config.auth as Record<string, string> | undefined)?.type) ?? 'none';
  const auth       = (config.auth as Record<string, string>) ?? { type: 'none' };
  const timeout    = (config.response_timeout_secs as number) ?? 20;

  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const setAuth = (k: string, v: string) => set('auth', { ...auth, [k]: v });

  const addHeader = () => set('headers', [...headers, { key: '', value: '' }]);
  const removeHeader = (i: number) => set('headers', headers.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, k: 'key' | 'value', v: string) => {
    const next = [...headers];
    next[i] = { ...next[i], [k]: v };
    set('headers', next);
  };

  const addBodyParam = () => set('body_params', [...bodyParams, { name: '', type: 'string', description: '', required: true }]);
  const removeBodyParam = (i: number) => set('body_params', bodyParams.filter((_, idx) => idx !== i));
  const updateBodyParam = (i: number, k: keyof QueryParam, v: unknown) => {
    const next = [...bodyParams];
    next[i] = { ...next[i], [k]: v };
    set('body_params', next);
  };

  return (
    <div>
      {/* URL + Method */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
        <div>
          <FLabel>Endpoint URL <span style={{ color: T.red }}>*</span></FLabel>
          <FInput
            value={url}
            onChange={(v) => set('url', v)}
            placeholder="https://your-api.com/webhook"
            error={!url}
          />
        </div>
        <div>
          <FLabel>Method</FLabel>
          <FSelect value={method} onChange={(v) => set('method', v)}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </FSelect>
        </div>
      </div>

      {/* Request Headers */}
      <SectionDivider label="Request Headers" color={T.cyan} />
      {headers.map((h, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 8, marginBottom: 8, animation: 'ctm-row-in 0.2s both' }}>
          <FInput value={h.key}   onChange={(v) => updateHeader(i, 'key',   v)} placeholder="Header name" />
          <FInput value={h.value} onChange={(v) => updateHeader(i, 'value', v)} placeholder="Value" />
          <RemoveBtn onClick={() => removeHeader(i)} />
        </div>
      ))}
      <AddBtn onClick={addHeader} label="Add header" color={T.cyan} />

      {/* Authentication */}
      <SectionDivider label="Authentication" color={T.yellow} />
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, marginBottom: authType !== 'none' ? 10 : 0 }}>
        <div>
          <FLabel>Auth type</FLabel>
          <FSelect value={authType} onChange={(v) => setAuth('type', v)}>
            <option value="none">None</option>
            <option value="bearer">Bearer Token</option>
            <option value="api_key">API Key Header</option>
            <option value="basic">Basic Auth</option>
          </FSelect>
        </div>
        {authType === 'bearer' && (
          <div>
            <FLabel>Bearer token</FLabel>
            <FInput type="password" value={auth.token ?? ''} onChange={(v) => setAuth('token', v)} placeholder="eyJhb…" />
          </div>
        )}
        {authType === 'api_key' && (
          <>
            <div>
              <FLabel>Header name</FLabel>
              <FInput value={auth.header ?? ''} onChange={(v) => setAuth('header', v)} placeholder="X-API-Key" />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div />
              <div>
                <FLabel>Key value</FLabel>
                <FInput type="password" value={auth.token ?? ''} onChange={(v) => setAuth('token', v)} placeholder="sk-…" />
              </div>
            </div>
          </>
        )}
        {authType === 'basic' && (
          <>
            <div>
              <FLabel>Username</FLabel>
              <FInput value={auth.username ?? ''} onChange={(v) => setAuth('username', v)} placeholder="user" />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div />
              <div>
                <FLabel>Password</FLabel>
                <FInput type="password" value={auth.password ?? ''} onChange={(v) => setAuth('password', v)} placeholder="••••••••" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Body Parameters */}
      <SectionDivider label="Request Body Parameters" color={T.green} />
      <div style={{ marginBottom: 8, fontSize: 11, color: T.textM, lineHeight: 1.55 }}>
        Define the parameters ElevenLabs will include in the request body. These describe what the LLM can pass.
      </div>
      {bodyParams.map((p, i) => (
        <div key={i} style={{
          background: `${T.bg0}`, border: `1px solid ${T.border}`,
          borderRadius: 9, padding: '12px', marginBottom: 8,
          animation: 'ctm-row-in 0.2s both',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 28px', gap: 8, marginBottom: 8 }}>
            <FInput value={p.name} onChange={(v) => updateBodyParam(i, 'name', v)} placeholder="param_name" />
            <FSelect value={p.type} onChange={(v) => updateBodyParam(i, 'type', v)}>
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="object">object</option>
            </FSelect>
            <RemoveBtn onClick={() => removeBodyParam(i)} />
          </div>
          <FInput
            value={p.description}
            onChange={(v) => updateBodyParam(i, 'description', v)}
            placeholder="Describe how the LLM should populate this field"
            style={{ marginBottom: 6 }}
          />
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => updateBodyParam(i, 'required', !p.required)}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${p.required ? T.green : T.border}`,
              background: p.required ? `${T.green}20` : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}>
              {p.required && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <span style={{ fontSize: 11.5, color: T.textM }}>Required</span>
          </div>
        </div>
      ))}
      <AddBtn onClick={addBodyParam} label="Add parameter" color={T.green} />

      {/* Timeout */}
      <SectionDivider label="Settings" color={T.textM} />
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
        <div>
          <FLabel hint="— seconds">Response timeout</FLabel>
          <FInput
            value={String(timeout)}
            onChange={(v) => set('response_timeout_secs', parseInt(v) || 20)}
            placeholder="20"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Client form ───────────────────────────────────────────────────────────────

function ClientForm({
  params, onParamsChange,
  expectsResponse, onExpectsResponseChange,
  timeout, onTimeoutChange,
}: {
  params: ToolParameter[];
  onParamsChange: (p: ToolParameter[]) => void;
  expectsResponse: boolean;
  onExpectsResponseChange: (v: boolean) => void;
  timeout: number;
  onTimeoutChange: (v: number) => void;
}) {
  const addParam = () => onParamsChange([...params, {
    id: `param_${Date.now()}`,
    type: 'string',
    description: '',
    required: true,
    value_type: 'llm_prompt',
    enum_values: [],
  }]);
  const removeParam = (i: number) => onParamsChange(params.filter((_, idx) => idx !== i));
  const updateParam = (i: number, k: keyof ToolParameter, v: unknown) => {
    const next = [...params];
    next[i] = { ...next[i], [k]: v };
    onParamsChange(next);
  };
  const addEnum = (i: number) => {
    const next = [...params];
    next[i] = { ...next[i], enum_values: [...(next[i].enum_values ?? []), ''] };
    onParamsChange(next);
  };
  const removeEnum = (pi: number, ei: number) => {
    const next = [...params];
    next[pi] = { ...next[pi], enum_values: (next[pi].enum_values ?? []).filter((_, idx) => idx !== ei) };
    onParamsChange(next);
  };
  const updateEnum = (pi: number, ei: number, v: string) => {
    const next = [...params];
    const enums = [...(next[pi].enum_values ?? [])];
    enums[ei] = v;
    next[pi] = { ...next[pi], enum_values: enums };
    onParamsChange(next);
  };

  return (
    <div>
      <div style={{
        display: 'flex', gap: 10, padding: '10px 14px',
        background: `${T.purple}08`, border: `1px solid ${T.purple}20`,
        borderRadius: 9, marginBottom: 16, fontSize: 11.5, color: T.textS, lineHeight: 1.55,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.purpleL} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Client tools fire a browser event — no HTTP call to your server. In the Voxara/Twilio native integration, client tools are received as callbacks without requiring a server endpoint.
      </div>

      {/* Response */}
      <SectionDivider label="Response Behaviour" color={T.purple} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16, alignItems: 'center', marginBottom: 14 }}>
        <FToggle value={expectsResponse} onChange={onExpectsResponseChange} label="Wait for tool response before resuming" />
        {expectsResponse && (
          <div>
            <FLabel hint="— seconds">Timeout</FLabel>
            <FInput
              value={String(timeout)}
              onChange={(v) => onTimeoutChange(parseInt(v) || 1)}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>
        )}
      </div>

      {/* Parameters */}
      <SectionDivider label="Parameters" color={T.purple} />
      {params.map((p, i) => (
        <div key={i} style={{
          background: T.bg0,
          border: `1px solid ${T.purple}25`,
          borderLeft: `3px solid ${T.purple}60`,
          borderRadius: 9, padding: '12px 14px', marginBottom: 10,
          animation: 'ctm-row-in 0.2s both',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 28px', gap: 8, marginBottom: 8 }}>
            <div>
              <FLabel>Identifier</FLabel>
              <FInput
                value={p.id}
                onChange={(v) => updateParam(i, 'id', v)}
                placeholder="param_name"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}
              />
            </div>
            <div>
              <FLabel>Type</FLabel>
              <FSelect value={p.type} onChange={(v) => updateParam(i, 'type', v as ToolParameter['type'])}>
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
              </FSelect>
            </div>
            <div>
              <FLabel>Value type</FLabel>
              <FSelect value={p.value_type} onChange={(v) => updateParam(i, 'value_type', v as ToolParameter['value_type'])}>
                <option value="llm_prompt">LLM Prompt</option>
                <option value="constant">Constant</option>
              </FSelect>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 0 }}>
              <RemoveBtn onClick={() => removeParam(i)} />
            </div>
          </div>

          <FTextarea
            value={p.description}
            onChange={(v) => updateParam(i, 'description', v)}
            placeholder={p.value_type === 'llm_prompt' ? 'Describe how the LLM should extract this from the conversation…' : 'Static value description'}
            rows={2}
            style={{ marginBottom: 8 }}
          />

          {p.value_type === 'constant' && (
            <div style={{ marginBottom: 8 }}>
              <FLabel>Constant value</FLabel>
              <FInput
                value={p.constant_value ?? ''}
                onChange={(v) => updateParam(i, 'constant_value', v)}
                placeholder="hardcoded value"
              />
            </div>
          )}

          {/* Enum values */}
          {p.type === 'string' && (
            <div>
              <FLabel hint="— optional, constrain LLM to these values">Enum values</FLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {(p.enum_values ?? []).map((ev, ei) => (
                  <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FInput
                      value={ev}
                      onChange={(v) => updateEnum(i, ei, v)}
                      placeholder="value"
                      style={{ width: 100, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
                    />
                    <RemoveBtn onClick={() => removeEnum(i, ei)} />
                  </div>
                ))}
                <AddBtn onClick={() => addEnum(i)} label="Add value" color={T.purple} />
              </div>
            </div>
          )}

          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginTop: 4 }}
            onClick={() => updateParam(i, 'required', !p.required)}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 4,
              border: `1.5px solid ${p.required ? T.purple : T.border}`,
              background: p.required ? `${T.purple}20` : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s',
            }}>
              {p.required && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.purple} strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <span style={{ fontSize: 11.5, color: T.textM }}>Required</span>
          </div>
        </div>
      ))}
      <AddBtn onClick={addParam} label="Add parameter" color={T.purple} />
    </div>
  );
}

// ── MCP form ──────────────────────────────────────────────────────────────────

function McpForm({ config, onChange }: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const serverUrl = (config.server_url as string) ?? '';
  const authType  = (config.auth_type as string)  ?? 'none';
  const authToken = (config.auth_token as string)  ?? '';
  const set = (k: string, v: unknown) => onChange({ ...config, [k]: v });

  return (
    <div>
      <div style={{
        display: 'flex', gap: 10, padding: '10px 14px',
        background: `${T.purpleL}08`, border: `1px solid ${T.purpleL}20`,
        borderRadius: 9, marginBottom: 16, fontSize: 11.5, color: T.textS, lineHeight: 1.55,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.purpleL} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3"/>
        </svg>
        MCP tools are proxied through Voxara's backend to your Model Context Protocol server. The server must implement the MCP specification.
      </div>

      <SectionDivider label="Server Connection" color={T.purpleL} />
      <div style={{ marginBottom: 12 }}>
        <FLabel>MCP Server URL <span style={{ color: T.red }}>*</span></FLabel>
        <FInput
          value={serverUrl}
          onChange={(v) => set('server_url', v)}
          placeholder="https://your-mcp-server.com/mcp"
          error={!serverUrl}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}
        />
      </div>

      <SectionDivider label="Authentication" color={T.yellow} />
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
        <div>
          <FLabel>Auth type</FLabel>
          <FSelect value={authType} onChange={(v) => set('auth_type', v)}>
            <option value="none">None</option>
            <option value="bearer">Bearer Token</option>
          </FSelect>
        </div>
        {authType === 'bearer' && (
          <div>
            <FLabel>Bearer token</FLabel>
            <FInput type="password" value={authToken} onChange={(v) => set('auth_token', v)} placeholder="mcp_token_…" />
          </div>
        )}
      </div>

      <SectionDivider label="Scaffold Note" color={T.textM} />
      <div style={{
        padding: '10px 14px', background: `${T.bg0}`,
        border: `1px solid ${T.border}`, borderRadius: 8,
        fontSize: 11.5, color: T.textM, lineHeight: 1.6,
        fontFamily: 'JetBrains Mono, monospace',
      }}>
        <div style={{ color: T.purpleL, fontWeight: 600, marginBottom: 4 }}>MCP Integration — Phase 1 Scaffold</div>
        Tool parameters will be sent as: <span style={{ color: T.textS }}>{'{ "tool": "<name>", "parameters": { ... } }'}</span><br />
        Your MCP server should respond with: <span style={{ color: T.textS }}>{'{ "result": "..." }'}</span>
      </div>
    </div>
  );
}

// ── Shared behaviour fields ───────────────────────────────────────────────────

function BehaviourFields({
  disableInterruptions, onDisableInterruptions,
  executionMode, onExecutionMode,
  preToolSpeech, onPreToolSpeech,
}: {
  disableInterruptions: boolean; onDisableInterruptions: (v: boolean) => void;
  executionMode: string; onExecutionMode: (v: string) => void;
  preToolSpeech: string; onPreToolSpeech: (v: string) => void;
}) {
  return (
    <div>
      <SectionDivider label="Behaviour" color={T.textM} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <FLabel>Execution mode</FLabel>
          <FSelect value={executionMode} onChange={onExecutionMode}>
            <option value="immediate">Immediate — agent keeps talking</option>
            <option value="blocking">Blocking — agent waits for result</option>
          </FSelect>
        </div>
        <div>
          <FLabel>Pre-tool speech</FLabel>
          <FSelect value={preToolSpeech} onChange={onPreToolSpeech}>
            <option value="auto">Auto — agent decides</option>
            <option value="force">Force — always speak first</option>
            <option value="off">Off — silent execution</option>
          </FSelect>
        </div>
      </div>
      <FToggle
        value={disableInterruptions}
        onChange={onDisableInterruptions}
        label="Disable interruptions while tool is running"
      />
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function CreateToolModal({ agentId, editTool, onSave, onClose }: Props) {
  const isEdit = !!editTool;

  const [toolType,             setToolType]             = useState<ToolType>(editTool?.el_tool_type ?? 'webhook');
  const [name,                 setName]                 = useState(editTool?.name ?? '');
  const [description,          setDescription]          = useState(editTool?.description ?? '');
  const [disableInterruptions, setDisableInterruptions] = useState(editTool?.disable_interruptions ?? false);
  const [executionMode,        setExecutionMode]        = useState(editTool?.execution_mode ?? 'immediate');
  const [preToolSpeech,        setPreToolSpeech]        = useState(editTool?.pre_tool_speech ?? 'auto');
  const [webhookConfig,        setWebhookConfig]        = useState<Record<string, unknown>>(
    toolType === 'webhook' ? (editTool?.config ?? {}) : {}
  );
  const [clientParams,         setClientParams]         = useState<ToolParameter[]>(editTool?.tool_parameters ?? []);
  const [expectsResponse,      setExpectsResponse]      = useState(editTool?.expects_response ?? false);
  const [clientTimeout,        setClientTimeout]        = useState(editTool?.response_timeout_secs ?? 1);
  const [mcpConfig,            setMcpConfig]            = useState<Record<string, unknown>>(
    toolType === 'mcp' ? (editTool?.config ?? {}) : {}
  );

  const [saving,   setSaving]   = useState(false);
  const [nameErr,  setNameErr]  = useState(false);
  const [descErr,  setDescErr]  = useState(false);
  const [urlErr,   setUrlErr]   = useState(false);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const meta = TYPE_META[toolType];

  const handleSubmit = useCallback(async () => {
    let err = false;
    if (!name.trim())        { setNameErr(true);  err = true; }
    if (!description.trim()) { setDescErr(true);  err = true; }
    if (toolType === 'webhook' && !(webhookConfig.url as string)?.trim()) {
      setUrlErr(true); err = true;
    }
    if (toolType === 'mcp' && !(mcpConfig.server_url as string)?.trim()) {
      err = true;
    }
    if (err) return;

    setSaving(true);
    try {
      // Build parameters_schema from webhook body params
      let parametersSchema: Record<string, unknown> = {};
      if (toolType === 'webhook') {
        const bodyParams = (webhookConfig.body_params as QueryParam[]) ?? [];
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const p of bodyParams) {
          if (p.name) {
            properties[p.name] = { type: p.type, description: p.description };
            if (p.required) required.push(p.name);
          }
        }
        parametersSchema = { type: 'object', properties, required };
      }

      const payload: CustomToolCreate = {
        agent_id:             agentId,
        el_tool_type:         toolType,
        tool_type:            toolType === 'webhook' ? 'custom_webhook' : toolType === 'client' ? 'custom_client' : 'custom_mcp',
        name:                 name.trim(),
        description:          description.trim(),
        parameters_schema:    parametersSchema,
        tool_parameters:      toolType === 'client' ? clientParams : [],
        config:               toolType === 'webhook' ? webhookConfig : toolType === 'mcp' ? mcpConfig : {},
        disable_interruptions: disableInterruptions,
        execution_mode:       executionMode,
        pre_tool_speech:      preToolSpeech,
        expects_response:     toolType === 'client' ? expectsResponse : false,
        response_timeout_secs: toolType === 'client' ? clientTimeout : 20,
      };

      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }, [
    agentId, toolType, name, description, webhookConfig, clientParams,
    expectsResponse, clientTimeout, mcpConfig,
    disableInterruptions, executionMode, preToolSpeech, onSave,
  ]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      animation: 'ctm-backdrop 0.2s both',
    }}>
      <style>{MODAL_STYLES}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(4,7,14,0.82)',
          backdropFilter: 'blur(8px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 680,
        maxHeight: 'calc(100vh - 40px)',
        display: 'flex', flexDirection: 'column',
        background: T.bg1,
        border: `1px solid ${T.border}`,
        borderRadius: 18,
        boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        animation: 'ctm-slide-up 0.3s cubic-bezier(0.16,1,0.3,1) both',
        overflow: 'hidden',
      }}>

        {/* Top accent */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent 5%, ${meta.color}60 40%, ${meta.color}45 60%, transparent 95%)`,
          transition: 'background 0.3s',
        }} />

        {/* Header */}
        <div style={{
          padding: '18px 22px 16px',
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${meta.color}15`,
                border: `1px solid ${meta.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: meta.color,
              }}>
                {meta.icon}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.textP, fontFamily: 'Syne, sans-serif', letterSpacing: '-0.01em' }}>
                  {isEdit ? 'Edit Tool' : 'Create Tool'}
                </div>
                <div style={{ fontSize: 11, color: T.textM }}>
                  {isEdit ? `Editing ${editTool.name}` : meta.desc}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`,
                background: 'transparent', color: T.textM,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderH; e.currentTarget.style.color = T.textS; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border;  e.currentTarget.style.color = T.textM; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Type selector tabs */}
          {!isEdit && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['webhook', 'client', 'mcp'] as ToolType[]).map((t) => {
                const m = TYPE_META[t];
                const active = toolType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setToolType(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '7px 14px', borderRadius: 9,
                      border: `1px solid ${active ? `${m.color}45` : T.border}`,
                      background: active ? `${m.color}10` : 'transparent',
                      color: active ? m.color : T.textM,
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      cursor: 'pointer', transition: 'all 0.18s',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <span style={{ color: active ? m.color : T.textM, transition: 'color 0.18s' }}>{m.icon}</span>
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '18px 22px',
          animation: 'ctm-tab-in 0.22s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          {/* Name & Description — common to all types */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <FLabel>Tool name <span style={{ color: T.red }}>*</span></FLabel>
              <FInput
                value={name}
                onChange={(v) => { setName(v); setNameErr(false); }}
                placeholder="e.g. lookup_order_status"
                error={nameErr}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}
              />
              {nameErr && (
                <div style={{ fontSize: 10.5, color: T.red, marginTop: 4 }}>Name is required</div>
              )}
            </div>
            <div />
          </div>
          <div style={{ marginBottom: 4 }}>
            <FLabel>Description <span style={{ color: T.red }}>*</span></FLabel>
            <FTextarea
              value={description}
              onChange={(v) => { setDescription(v); setDescErr(false); }}
              placeholder="Describe when and how the agent should use this tool…"
              rows={2}
            />
            {descErr && (
              <div style={{ fontSize: 10.5, color: T.red, marginTop: 4 }}>Description is required</div>
            )}
          </div>

          {/* Type-specific form */}
          {toolType === 'webhook' && (
            <WebhookForm
              config={webhookConfig}
              onChange={(c) => { setWebhookConfig(c); setUrlErr(false); }}
            />
          )}
          {toolType === 'client' && (
            <ClientForm
              params={clientParams}
              onParamsChange={setClientParams}
              expectsResponse={expectsResponse}
              onExpectsResponseChange={setExpectsResponse}
              timeout={clientTimeout}
              onTimeoutChange={setClientTimeout}
            />
          )}
          {toolType === 'mcp' && (
            <McpForm config={mcpConfig} onChange={setMcpConfig} />
          )}

          {/* Behaviour */}
          <BehaviourFields
            disableInterruptions={disableInterruptions}
            onDisableInterruptions={setDisableInterruptions}
            executionMode={executionMode}
            onExecutionMode={setExecutionMode}
            preToolSpeech={preToolSpeech}
            onPreToolSpeech={setPreToolSpeech}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: T.bg0, flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, color: T.textM }}>
            <span style={{ color: meta.color, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
              {meta.label}
            </span>
            {' · '}
            Fields marked <span style={{ color: T.red }}>*</span> are required
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 18px', borderRadius: 9,
                border: `1px solid ${T.border}`,
                background: 'transparent', color: T.textS,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderH; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: '8px 22px', borderRadius: 9,
                border: `1px solid ${saving ? `${meta.color}30` : `${meta.color}55`}`,
                background: saving ? `${meta.color}10` : `${meta.color}18`,
                color: saving ? `${meta.color}70` : meta.color,
                fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s', fontFamily: 'Inter, sans-serif',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: saving ? 'none' : `0 0 20px ${meta.color}15`,
              }}
              onMouseEnter={(e) => { if (!saving) { e.currentTarget.style.background = `${meta.color}25`; e.currentTarget.style.boxShadow = `0 0 28px ${meta.color}22`; } }}
              onMouseLeave={(e) => { if (!saving) { e.currentTarget.style.background = `${meta.color}18`; e.currentTarget.style.boxShadow = `0 0 20px ${meta.color}15`; } }}
            >
              {saving ? (
                <>
                  <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${meta.color}30`, borderTopColor: meta.color, animation: 'ctm-spin 0.7s linear infinite' }} />
                  Saving…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {isEdit ? 'Save changes' : 'Create tool'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
