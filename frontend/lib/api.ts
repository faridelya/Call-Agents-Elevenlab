/**
 * Voxara API client — typed fetch wrapper with JWT auto-refresh.
 *
 * Access token:  stored in memory (no XSS risk)
 * Refresh token: stored in localStorage (survives page reload)
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// ── Token store (module-level memory) ─────────────────────────────────────────

let _accessToken: string | null = null;

export const tokenStore = {
  get: () => _accessToken,
  set: (t: string) => { _accessToken = t; },
  clear: () => { _accessToken = null; },
};

const REFRESH_KEY = 'voxara_refresh';

export const refreshStore = {
  get: () => (typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null),
  set: (t: string) => localStorage.setItem(REFRESH_KEY, t),
  clear: () => localStorage.removeItem(REFRESH_KEY),
};

// ── Core fetch ────────────────────────────────────────────────────────────────

async function _tryRefresh(): Promise<boolean> {
  const rt = refreshStore.get();
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) { refreshStore.clear(); return false; }
    const data = await res.json();
    tokenStore.set(data.access_token);
    if (data.refresh_token) refreshStore.set(data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchOpts = RequestInit & { auth?: boolean; retry?: boolean; timeoutMs?: number };

export async function apiFetch<T = unknown>(
  path: string,
  { auth = true, retry = true, timeoutMs, ...init }: FetchOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (auth && tokenStore.get()) {
    headers['Authorization'] = `Bearer ${tokenStore.get()}`;
  }

  const fetchInit: RequestInit = { ...init, headers };
  if (timeoutMs && !fetchInit.signal) {
    fetchInit.signal = AbortSignal.timeout(timeoutMs);
  }

  const res = await fetch(`${BASE}${path}`, fetchInit);

  // Auto-refresh on 401 and retry once
  if (res.status === 401 && retry) {
    const refreshed = await _tryRefresh();
    if (refreshed) return apiFetch(path, { auth, retry: false, ...init });
    // Refresh failed — clear tokens and let the auth context handle redirect
    tokenStore.clear();
    refreshStore.clear();
    window.dispatchEvent(new Event('voxara:logout'));
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).detail ?? msg; } catch { /* ignore */ }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  company_name?: string;
  subscription_tier: string;
  subscription_status: string;
}

export const auth = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST', auth: false,
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, full_name: string) =>
    apiFetch<LoginResponse>('/api/v1/auth/register', {
      method: 'POST', auth: false,
      body: JSON.stringify({ email, password, full_name }),
    }),

  me: () => apiFetch<UserProfile>('/api/v1/auth/me'),

  logout: () =>
    apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {}),
};

// ── Agents ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  description?: string;
  elevenlabs_agent_id?: string;
  voice_id: string;
  language: string;
  call_type: 'outbound' | 'inbound' | 'both';
  twilio_phone_number?: string | null;
  inbound_phone_number?: string | null;
  system_prompt: string;
  first_message?: string;
  agent_role?: string;
  company_name?: string;
  product_name?: string;
  max_call_duration_seconds: number;
  silence_timeout_seconds: number;
  llm_model: string;
  llm_temperature: number;
  tts_model: string;
  stt_provider: string;
  voice_stability: number | null;
  voice_similarity: number | null;
  call_script: {
    opener?: string;
    discovery?: string;
    pitch?: string;
    objection_handling?: string;
    closing?: string;
    faq?: string;
  };
  enabled_tools: string[];
  tool_configs: Record<string, unknown>;
  product_catalog: object[];
  qualification_criteria: Record<string, string>;
  el_last_synced_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentCreate {
  name: string;
  description?: string;
  call_type: string;
  voice_id: string;
  language?: string;
  system_prompt: string;
  first_message?: string;
  agent_role?: string;
  company_name?: string;
  product_name?: string;
  twilio_phone_number?: string | null;
  inbound_phone_number?: string | null;
  max_call_duration_seconds?: number;
  silence_timeout_seconds?: number;
  llm_model?: string;
  llm_temperature?: number;
  tts_model?: string;
  stt_provider?: string;
  voice_stability?: number;
  voice_similarity?: number;
  call_script?: {
    opener?: string;
    discovery?: string;
    pitch?: string;
    objection_handling?: string;
    closing?: string;
    faq?: string;
  };
  enabled_tools?: string[];
  tool_configs?: Record<string, unknown>;
  product_catalog?: object[];
  qualification_criteria?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export const agents = {
  list: (page = 1) =>
    apiFetch<PaginatedResponse<Agent>>(`/api/v1/agents?page=${page}&page_size=20`),

  get: (id: string) => apiFetch<Agent>(`/api/v1/agents/${id}`),

  create: (body: AgentCreate) =>
    apiFetch<Agent>('/api/v1/agents', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: Partial<AgentCreate>) =>
    apiFetch<Agent>(`/api/v1/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: (id: string) =>
    apiFetch(`/api/v1/agents/${id}`, { method: 'DELETE' }),

  sync: (id: string) =>
    apiFetch<{ message: string }>(`/api/v1/agents/${id}/sync`, { method: 'POST' }),

  voices: () =>
    apiFetch<Array<{ voice_id: string; name: string; preview_url?: string }>>('/api/v1/agents/voices'),
};

// ── Calls ─────────────────────────────────────────────────────────────────────

export interface CallRecord {
  id: string;
  agent_id?: string;
  agent_name?: string;
  campaign_id?: string;
  from_number?: string;
  to_number?: string;
  direction: 'inbound' | 'outbound';
  status: string;
  outcome?: string;
  duration_seconds?: number;
  sentiment_score?: number;
  talk_ratio?: number;
  auto_summary?: string;
  transcript?: Array<{ role: string; text: string; timestamp: string }>;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export const calls = {
  list: (page = 1, agent_id?: string, direction?: 'inbound' | 'outbound') => {
    const q = new URLSearchParams({ page: String(page), page_size: '20' });
    if (agent_id) q.set('agent_id', agent_id);
    if (direction) q.set('direction', direction);
    return apiFetch<PaginatedResponse<CallRecord>>(`/api/v1/calls?${q}`);
  },

  get: (id: string) => apiFetch<CallRecord>(`/api/v1/calls/${id}`),

  outbound: (agent_id: string, to_number: string, phone_number_id?: string, from_number?: string) =>
    apiFetch<CallRecord>('/api/v1/calls/outbound', {
      method: 'POST',
      body: JSON.stringify({ agent_id, to_number, phone_number_id, from_number }),
    }),

  end: (id: string) =>
    apiFetch<{ message: string }>(`/api/v1/calls/${id}/end`, { method: 'POST', body: JSON.stringify({}) }),

  active: () =>
    apiFetch<{ active_calls: CallRecord[]; bridge_count: number }>('/api/v1/calls/active')
      .then((r) => r.active_calls ?? []),

  liveTranscript: (id: string) =>
    apiFetch<{ transcript: Array<{ role: string; text: string; timestamp: string }>; status: string }>(
      `/api/v1/calls/${id}/live-transcript`,
    ),
};

// ── Campaigns ─────────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';
  agent_id: string;
  phone_number_id?: string;
  total_contacts: number;
  contacts_called: number;
  contacts_answered: number;
  contacts_completed: number;
  contacts_failed: number;
  contacts_dnc: number;
  conversion_rate?: number;
  call_interval_seconds: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface CampaignCreate {
  name: string;
  description?: string;
  agent_id: string;
  phone_number_id?: string;
  call_interval_seconds?: number;
  max_concurrent_calls?: number;
  contacts?: object[];
}

export const contactPool = {
  get: () =>
    apiFetch<{ contacts: object[]; total: number }>('/api/v1/campaigns/pool'),
  save: (contacts: object[]) =>
    apiFetch<{ message: string }>('/api/v1/campaigns/pool', {
      method: 'PUT',
      body: JSON.stringify({ contacts }),
    }),
};

export const campaigns = {
  list: (page = 1) =>
    apiFetch<PaginatedResponse<Campaign>>(`/api/v1/campaigns?page=${page}&page_size=20`),

  get: (id: string) => apiFetch<Campaign>(`/api/v1/campaigns/${id}`),

  create: (body: CampaignCreate) =>
    apiFetch<Campaign>('/api/v1/campaigns', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: Partial<CampaignCreate>) =>
    apiFetch<Campaign>(`/api/v1/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: (id: string) =>
    apiFetch(`/api/v1/campaigns/${id}`, { method: 'DELETE' }),

  start: (id: string) =>
    apiFetch<Campaign>(`/api/v1/campaigns/${id}/start`, { method: 'POST', timeoutMs: 12_000 }),

  pause: (id: string) =>
    apiFetch<Campaign>(`/api/v1/campaigns/${id}/pause`, { method: 'POST', timeoutMs: 12_000 }),

  resume: (id: string) =>
    apiFetch<Campaign>(`/api/v1/campaigns/${id}/resume`, { method: 'POST', timeoutMs: 12_000 }),

  stop: (id: string) =>
    apiFetch<Campaign>(`/api/v1/campaigns/${id}/stop`, { method: 'POST', timeoutMs: 12_000 }),
};

// ── Leads ─────────────────────────────────────────────────────────────────────

export interface LeadCreate {
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  notes?: string | null;
  tags?: string[];
  custom_fields?: Record<string, string>;
}

export const leads = {
  create: (body: LeadCreate) =>
    apiFetch<{ id: string; phone: string }>('/api/v1/leads', { method: 'POST', body: JSON.stringify(body) }),
  list: (page = 1, search?: string) =>
    apiFetch<PaginatedResponse<{ id: string; phone: string; first_name: string | null; last_name: string | null }>>(
      `/api/v1/leads?page=${page}&page_size=50${search ? `&search=${encodeURIComponent(search)}` : ''}`
    ),
};

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  total_calls: number;
  completed_calls: number;
  total_leads: number;
  qualified_leads: number;
  conversion_rate: number;
  avg_call_duration_seconds: number;
  interested_outcomes: number;
}

export interface CallsOverTime {
  data: Array<{ period: string; count: number }>;
}

export interface OutcomeDistribution {
  outcomes: Array<{ outcome: string; count: number }>;
}

export interface AgentMetrics {
  agents: Array<{
    agent_id: string;
    agent_name: string | null;
    total_calls: number;
    avg_duration_seconds: number;
    avg_sentiment: number;
    interested_count: number;
    order_confirmed_count: number;
    connect_later_count: number;
    not_interested_count: number;
    voicemail_count: number;
    callback_count: number;
    conversion_rate: number;
  }>;
}

export interface CampaignOutcomes {
  campaigns: Array<{ id: string; name: string; status: string }>;
  agents: Array<{ id: string; name: string }>;
  outcomes: Array<{ outcome: string; count: number }>;
  total_calls: number;
}

export const analytics = {
  overview: () => apiFetch<AnalyticsOverview>('/api/v1/analytics/overview'),
  callsOverTime: (group_by = 'day') =>
    apiFetch<CallsOverTime>(`/api/v1/analytics/calls?group_by=${group_by}`),
  outcomes: () => apiFetch<OutcomeDistribution>('/api/v1/analytics/outcomes'),
  agents: () => apiFetch<AgentMetrics>('/api/v1/analytics/agents'),
  campaigns: () => apiFetch<{ campaigns: object[] }>('/api/v1/analytics/campaigns'),
  campaignOutcomes: (campaignId?: string, agentId?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaign_id', campaignId);
    if (agentId) params.set('agent_id', agentId);
    const qs = params.toString();
    return apiFetch<CampaignOutcomes>(`/api/v1/analytics/campaign-outcomes${qs ? `?${qs}` : ''}`);
  },
};

// ── Settings / Usage ──────────────────────────────────────────────────────────

export interface CredentialsData {
  twilio_account_sid: string | null;
  twilio_auth_token_masked: string | null;
  elevenlabs_api_key_masked: string | null;
  elevenlabs_webhook_secret_masked: string | null;
  openai_api_key_masked: string | null;
  google_api_key_masked: string | null;
  anthropic_api_key_masked: string | null;
  twilio_connected: boolean;
  elevenlabs_connected: boolean;
  elevenlabs_webhook_configured: boolean;
  webhook_base_url: string;
}

export interface CredentialsSaveRequest {
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  elevenlabs_api_key?: string | null;
  elevenlabs_webhook_secret?: string | null;
  openai_api_key?: string | null;
  google_api_key?: string | null;
  anthropic_api_key?: string | null;
}

export interface ElevenLabsInvoice {
  amount_due_cents: number | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  currency: string | null;
  payment_intent_status: string | null;
  next_payment_attempt_unix: number | null;
}

export interface ElevenLabsCostData {
  configured: boolean;
  tier: string;
  status: string;
  currency: string | null;
  billing_period: string | null;
  character_refresh_period: string | null;
  character_count: number;
  character_limit: number;
  character_remaining: number;
  character_usage_percent: number;
  max_character_limit_extension: number | null;
  can_extend_character_limit: boolean;
  allowed_to_extend_character_limit: boolean;
  next_character_count_reset_unix: number | null;
  has_open_invoices: boolean;
  open_invoices: ElevenLabsInvoice[];
  next_invoice: ElevenLabsInvoice | null;
  warning_level: 'ok' | 'warning' | 'critical' | 'error';
  warning_message: string;
  cached: boolean;
  error: string | null;
}

export interface TwilioCostData {
  configured: boolean;
  account_sid: string | null;
  balance: number | null;
  currency: string | null;
  warning_level: 'ok' | 'warning' | 'critical' | 'error';
  warning_message: string;
  cached: boolean;
  error: string | null;
}

export const settings = {
  usage: () => apiFetch<{ total_calls: number; total_minutes: number }>('/api/v1/settings/usage'),
  billing: () =>
    apiFetch<{ subscription_tier: string; subscription_status: string; stripe_customer_id?: string }>(
      '/api/v1/settings/billing',
    ),
  updateMe: (body: Partial<UserProfile>) =>
    apiFetch<UserProfile>('/api/v1/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
  getCredentials: () => apiFetch<CredentialsData>('/api/v1/settings/credentials'),
  saveCredentials: (body: CredentialsSaveRequest) =>
    apiFetch<{ message: string }>('/api/v1/settings/credentials', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getELPlan: () =>
    apiFetch<{ tier: string; is_enterprise: boolean }>('/api/v1/settings/el-plan'),
  getElevenLabsCost: () =>
    apiFetch<ElevenLabsCostData>('/api/v1/settings/elevenlabs/cost'),
  getTwilioCost: () =>
    apiFetch<TwilioCostData>('/api/v1/settings/twilio/cost'),
};

// ── Phone Numbers ─────────────────────────────────────────────────────────────

export interface PhoneNumber {
  id: string;
  phone_number: string;
  friendly_name?: string;
  inbound_enabled: boolean;
  inbound_agent_id?: string;
  twilio_sid?: string;
  created_at: string;
}

export const phoneNumbers = {
  list: (page = 1) =>
    apiFetch<PaginatedResponse<PhoneNumber>>(`/api/v1/phone-numbers?page=${page}&page_size=50`),
};
