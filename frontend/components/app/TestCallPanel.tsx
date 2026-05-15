'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutboundCall, useCalls, useEndCall } from '@/lib/hooks/useCalls';
import { useEventStream, type LiveEvent } from '@/lib/hooks/useEventStream';
import { apiFetch, calls as callsApi, settings as apiSettings } from '@/lib/api';

type CallState = 'idle' | 'calling' | 'connected' | 'ended';

interface TranscriptMsg {
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
}

// ─── Shared field style ───────────────────────────────────────────────────────

function PhoneField({ value, onChange, onKeyDown, disabled }: {
  value: string; onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="tel"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      autoComplete="off"
      placeholder="+1 (555) 000-0000"
      style={{
        width: '100%', boxSizing: 'border-box',
        background: disabled ? '#F1F5F9' : '#F8FAFC',
        borderRadius: 12, padding: '14px 18px',
        fontSize: 20, fontFamily: 'var(--font-jetbrains-mono), monospace',
        color: '#0F172A', outline: 'none', textAlign: 'center',
        letterSpacing: '0.06em',
        border: `1px solid ${focused ? 'rgba(139,92,246,0.5)' : '#E2E8F0'}`,
        boxShadow: focused ? '0 0 0 3px rgba(124,110,250,0.08)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function NameField({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      autoComplete="off"
      placeholder={placeholder ?? 'Customer Name'}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: disabled ? '#F1F5F9' : '#F8FAFC',
        borderRadius: 10, padding: '11px 14px',
        fontSize: 14, fontFamily: 'var(--font-ui), sans-serif',
        color: '#0F172A', outline: 'none',
        border: `1px solid ${focused ? 'rgba(139,92,246,0.5)' : '#E2E8F0'}`,
        boxShadow: focused ? '0 0 0 3px rgba(124,110,250,0.07)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg, agentName, customerName }: { msg: TranscriptMsg; agentName: string; customerName?: string }) {
  const isAgent = msg.role === 'agent';
  const speaker = isAgent ? agentName : (customerName?.trim() || 'Customer');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-start' : 'flex-end', gap: 4, animation: 'msg-enter 0.22s ease forwards' }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'var(--font-ui)', color: isAgent ? '#A89AF9' : '#22D3EE' }}>
        {speaker}
      </span>
      <div style={{
        maxWidth: '84%',
        background: isAgent ? 'rgba(124,110,250,0.08)' : 'rgba(34,211,238,0.06)',
        border: `1px solid ${isAgent ? 'rgba(124,110,250,0.18)' : 'rgba(34,211,238,0.12)'}`,
        borderRadius: isAgent ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
        padding: '10px 14px', fontSize: 13, color: '#1E293B', lineHeight: 1.65,
        fontFamily: 'var(--font-ui), sans-serif',
      }}>
        {msg.text}
      </div>
      <span style={{ fontSize: 9, color: '#94A3B8', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
        {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}

// ─── Prerequisite row ─────────────────────────────────────────────────────────

function Prereq({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10, background: ok ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)', border: `1px solid ${ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'}` }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: ok ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: ok ? '#10B981' : '#F59E0B', fontWeight: 800 }}>{ok ? '✓' : '!'}</span>
      </div>
      <span style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: ok ? '#94A3B8' : '#64748B', flex: 1 }}>{label}</span>
      {!ok && <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-ui)' }}>{hint}</span>}
    </div>
  );
}

// ─── Credentials required gate ────────────────────────────────────────────────

function CredentialsRequired() {
  return (
    <div style={{
      width: '100%', maxWidth: 380,
      background: 'rgba(240,180,41,0.03)',
      border: '1px solid rgba(240,180,41,0.22)',
      borderRadius: 16, padding: '28px 24px',
      position: 'relative', overflow: 'hidden',
      animation: 'cred-gate-in 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <style>{`@keyframes cred-gate-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`}</style>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(240,180,41,0.6), rgba(255,77,109,0.35), transparent)' }} />

      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F0B429" strokeWidth="1.8" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-display), sans-serif', marginBottom: 6 }}>
        Twilio Credentials Required
      </div>
      <div style={{ fontSize: 12, color: '#64748B', fontFamily: 'var(--font-ui)', lineHeight: 1.65, marginBottom: 24 }}>
        Test calls require your own Twilio credentials. This platform does not use shared environment credentials — every workspace must connect its own Twilio account.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        {([
          ['1', 'Go to ', 'Settings → Credentials'],
          ['2', 'Add your ', 'Twilio Account SID and Auth Token'],
          ['3', 'Save and ', 'return here to test your agent'],
        ] as [string, string, string][]).map(([n, pre, highlight]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'rgba(240,180,41,0.1)', border: '1px solid rgba(240,180,41,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#F0B429', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              {n}
            </div>
            <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-ui)' }}>
              {pre}
              <span style={{ color: '#F0B429', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11, padding: '1px 5px', background: 'rgba(240,180,41,0.07)', borderRadius: 4, border: '1px solid rgba(240,180,41,0.18)' }}>
                {highlight}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF4D6D" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-ui)' }}>Calls are blocked until credentials are verified.</span>
      </div>
    </div>
  );
}

// ─── Field label ──────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)' }}>
      {children}
    </label>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TestCallPanel({
  agentId,
  agentName,
  isSynced,
  agentPhoneNumber,
  onCallEnded,
}: {
  agentId: string | null;
  agentName: string;
  isSynced: boolean;
  agentPhoneNumber?: string | null;
  onCallEnded?: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [callRecordId, setCallRecordId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMsg[]>([]);
  const [duration, setDuration] = useState(0);
  const [endReason, setEndReason] = useState('Call completed');
  const [callError, setCallError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callRecordIdRef = useRef<string | null>(null);
  const callStateRef = useRef<CallState>('idle');

  const outboundCall = useOutboundCall();
  const endCallMutation = useEndCall();
  const { data: callHistory } = useCalls(1, agentId ?? undefined);
  const pastCalls = callHistory?.items?.slice(0, 4) ?? [];

  // Credential status — null = loading, true/false = known
  const [twilioCxn, setTwilioCxn] = useState<boolean | null>(null);
  const [elCxn, setElCxn] = useState<boolean | null>(null);
  // EL plan — null = loading, true = enterprise (real-time WS relay), false = not enterprise (poll)
  const [isEnterprise, setIsEnterprise] = useState<boolean | null>(null);

  useEffect(() => {
    apiSettings.getCredentials()
      .then(d => { setTwilioCxn(d.twilio_connected); setElCxn(d.elevenlabs_connected); })
      .catch(() => {});
    apiSettings.getELPlan()
      .then(d => setIsEnterprise(d.is_enterprise))
      .catch(() => setIsEnterprise(false));
  }, []);

  useEffect(() => { callRecordIdRef.current = callRecordId; }, [callRecordId]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Fetch transcript immediately, then retry with increasing gaps.
  // Schedule: t=0, +10s, +20s, +35s, +65s, +90s — covers the ARQ job at ~60s.
  const loadTranscript = useCallback((rid: string, attempt = 0) => {
    const retryGaps = [10_000, 20_000, 35_000, 65_000, 90_000];
    apiFetch<{ transcript: TranscriptMsg[]; duration_seconds: number }>(`/api/v1/calls/${rid}/transcript`)
      .then(d => {
        if (d.transcript?.length) {
          setMessages(d.transcript.map(m => ({ role: m.role as 'user' | 'agent', text: m.text, timestamp: m.timestamp })));
        }
        if (d.duration_seconds != null) setDuration(d.duration_seconds);
        // Keep retrying — ARQ job ~60s later may return a fuller transcript
        if (attempt < retryGaps.length) {
          setTimeout(() => loadTranscript(rid, attempt + 1), retryGaps[attempt]);
        }
      })
      .catch(() => {
        if (attempt < retryGaps.length) {
          setTimeout(() => loadTranscript(rid, attempt + 1), retryGaps[attempt]);
        }
      });
  }, []);

  const applyFinalDuration = useCallback(async (rid: string) => {
    try {
      const call = await callsApi.get(rid);
      if (call.duration_seconds != null) {
        setDuration(call.duration_seconds);
        return;
      }
      if (call.started_at && call.ended_at) {
        const started = new Date(call.started_at).getTime();
        const ended = new Date(call.ended_at).getTime();
        if (Number.isFinite(started) && Number.isFinite(ended) && ended > started) {
          setDuration(Math.max(0, Math.round((ended - started) / 1000)));
        }
      }
    } catch {
      // Keep the local stopwatch value if the final record is not ready yet.
    }
  }, []);

  const finishCallUi = useCallback((reason: string, rid = callRecordIdRef.current) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (callStateRef.current !== 'ended') {
      setCallState('ended');
      setEndReason(reason);
      onCallEnded?.();
    }
    if (rid) {
      void applyFinalDuration(rid);
    }
  }, [applyFinalDuration, onCallEnded]);

  // Non-Enterprise polling: fetch partial transcript from EL every 2s while connected.
  // Enterprise users receive live transcript via the WS monitoring relay (transcript events).
  // Only runs for single test calls — campaign calls are blocked server-side (returns 403).
  // Auto-ends the UI when EL reports status=failed/done (call dropped on EL side).
  useEffect(() => {
    if (callState !== 'connected' || isEnterprise !== false || !callRecordId) return;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const d = await callsApi.liveTranscript(callRecordId);
        if (stopped) return;
        if (d.transcript?.length) {
          setMessages(
            d.transcript.map(m => ({
              role: m.role as 'user' | 'agent',
              text: m.text,
              timestamp: m.timestamp,
            })),
          );
        }
        // EL reported the conversation is over — transition to ended state
        if (d.status === 'failed' || d.status === 'done') {
          stopped = true;
          finishCallUi(d.status === 'failed' ? 'Call dropped by network' : 'Call completed', callRecordId);
          const rid = callRecordIdRef.current;
          if (rid) {
            try { await endCallMutation.mutateAsync(rid); } catch {}
            setTimeout(() => loadTranscript(rid), 3500);
          }
        }
      } catch {
        // silently ignore — call may not have a conversation yet
      }
    };
    poll(); // immediate first fetch
    const interval = setInterval(poll, 2000);
    return () => { stopped = true; clearInterval(interval); };
  }, [callState, isEnterprise, callRecordId, finishCallUi, loadTranscript, endCallMutation.mutateAsync]);

  useEventStream(
    useCallback((event: LiveEvent) => {
      const rid = callRecordIdRef.current;
      if (!rid) return;
      if (event.type === 'call_started' && event.call_record_id === rid) {
        setCallState('connected');
      } else if (event.type === 'call_ended' && event.call_record_id === rid) {
        finishCallUi('Call completed', rid);
        // Start transcript retry chain — ARQ job completes ~60s later with full transcript
        loadTranscript(rid);
      } else if (event.type === 'transcript' && event.call_record_id === rid) {
        setMessages((prev) => [...prev, { role: event.role, text: event.text, timestamp: event.timestamp }]);
      } else if (event.type === 'call_processed' && event.call_record_id === rid) {
        finishCallUi('Call completed', rid);
        // ARQ post-call job finished — fetch the final (most complete) transcript
        loadTranscript(rid);
      }
    }, [finishCallUi, loadTranscript])
  );

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  // Escape hatch: if we stay in 'calling' for 75s with no server event, the
  // status callback URL is unreachable (expired ngrok / no tunnel). Auto-end.
  useEffect(() => {
    if (callState !== 'calling') return;
    const timeout = setTimeout(() => {
      setCallState('ended');
      setEndReason('Call timed out — no server response. Check ngrok tunnel and BASE_URL in backend/.env.');
    }, 75_000);
    return () => clearTimeout(timeout);
  }, [callState]);

  async function handleStart() {
    if (!agentId || !phone) return;
    if (twilioCxn === false) return;
    setCallState('calling');
    setCallError(null);
    setMessages([]);
    setDuration(0);
    try {
      const record = await outboundCall.mutateAsync({
        agent_id: agentId,
        to_number: phone,
        from_number: agentPhoneNumber ?? undefined,
      });
      setCallRecordId(record.id);
      callRecordIdRef.current = record.id;
    } catch (err: unknown) {
      setCallState('idle');
      const msg = err instanceof Error ? err.message : 'Failed to start call';
      setCallError(msg);
    }
  }

  async function handleCancel() {
    const rid = callRecordIdRef.current;
    setCallState('idle');
    setCallError(null);
    setMessages([]);
    setDuration(0);
    setCallRecordId(null);
    callRecordIdRef.current = null;
    if (rid) {
      try { await endCallMutation.mutateAsync(rid); } catch {}
    }
  }

  function handleReset() {
    setCallState('idle');
    setMessages([]);
    setDuration(0);
    setCallRecordId(null);
    callRecordIdRef.current = null;
  }

  function fmtDur(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const canCall = !!agentId && isSynced && phone.trim().length >= 7 && twilioCxn !== false;
  const isCalling = callState === 'calling';

  // ── ENDED ─────────────────────────────────────────────────────────────────
  if (callState === 'ended') {
    return (
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#FFFFFF' }}>
        <style>{`
          @keyframes check-pop { 0%{transform:scale(0.4);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
          @keyframes msg-enter { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        {/* Left: Summary */}
        <div style={{
          flex: '0 0 38%', borderRight: '1px solid #F1F5F9',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '36px 32px',
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(16,185,129,0.05) 0%, transparent 70%)',
        }}>
          {/* Check icon */}
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '1.5px solid rgba(16,185,129,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'check-pop 0.45s ease forwards', marginBottom: 24 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>

          <h3 style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 6, textAlign: 'center' }}>Call Ended</h3>
          <p style={{ fontSize: 13, color: '#475569', fontFamily: 'var(--font-ui)', marginBottom: 4, textAlign: 'center' }}>{endReason}</p>

          {/* Stats */}
          <div style={{ width: '100%', marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-ui)' }}>Duration</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.04em' }}>{fmtDur(duration)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-ui)' }}>Messages</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-jetbrains-mono)' }}>{messages.length}</span>
            </div>
            {phone && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 10 }}>
                <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-ui)' }}>Number</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.04em' }}>{phone}</span>
              </div>
            )}
            {customerName.trim() && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 10 }}>
                <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-ui)' }}>Customer</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', fontFamily: 'var(--font-ui)' }}>{customerName}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleReset}
            style={{ marginTop: 28, width: '100%', background: 'transparent', border: '1px solid rgba(124,110,250,0.3)', borderRadius: 11, padding: '11px 22px', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: '#A89AF9', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,110,250,0.08)'; e.currentTarget.style.borderColor = 'rgba(124,110,250,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(124,110,250,0.3)'; }}
          >
            Make Another Call
          </button>
        </div>

        {/* Right: Full Transcript */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A89AF9" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-ui)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Conversation Transcript</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-jetbrains-mono)' }}>{messages.length} messages</span>
          </div>

          <div
            ref={transcriptRef}
            style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {messages.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 24, opacity: 0.15 }}>💬</div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>No transcript recorded</span>
              </div>
            ) : (
              messages.map((msg, i) => <MsgBubble key={i} msg={msg} agentName={agentName} customerName={customerName} />)
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── CONNECTED ─────────────────────────────────────────────────────────────
  if (callState === 'connected') {
    const freqDelays  = [0, 0.12, 0.24, 0.08, 0.32, 0.16, 0.4, 0.04, 0.28, 0.2, 0.36, 0.06];
    const freqHeights = [8, 18, 28, 22, 14, 32, 20, 10, 26, 16, 24, 12];

    return (
      <div style={{ display: 'flex', height: '100%', background: '#FFFFFF' }}>
        <style>{`
          @keyframes ring-expand { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.8);opacity:0} }
          @keyframes orb-breathe { 0%,100%{box-shadow:0 0 28px rgba(124,110,250,0.3),0 0 60px rgba(124,110,250,0.1)} 50%{box-shadow:0 0 44px rgba(124,110,250,0.55),0 0 90px rgba(124,110,250,0.18)} }
          @keyframes freq-bar    { 0%,100%{transform:scaleY(0.25)} 50%{transform:scaleY(1)} }
          @keyframes msg-enter   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
          @keyframes rec-blink   { 0%,100%{opacity:1} 50%{opacity:0.2} }
          @keyframes hdr-wave    { 0%,100%{height:3px} 50%{height:14px} }
          @keyframes float-up    { 0%{transform:translateY(0) scale(1);opacity:0.55} 100%{transform:translateY(-80px) scale(0);opacity:0} }
        `}</style>

        {/* Left: Transcript */}
        <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #F1F5F9', overflow: 'hidden' }}>
          <div style={{ padding: '13px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.9)', animation: 'rec-blink 1.4s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)' }}>
              {isEnterprise ? 'Live Transcript' : 'Transcript'}
            </span>
            {isEnterprise ? (
              <div style={{ display: 'flex', gap: 2.5, alignItems: 'center', marginLeft: 8 }}>
                {[0, 0.1, 0.2, 0.1, 0].map((delay, i) => (
                  <div key={i} style={{ width: 2.5, height: 3, background: 'linear-gradient(to top,#7C6EFA,#22D3EE)', borderRadius: 2, transformOrigin: 'bottom', animation: `hdr-wave 0.75s ease-in-out ${delay}s infinite` }} />
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-ui)', background: '#F8FAFC', padding: '2px 7px', borderRadius: 4, border: '1px solid #F1F5F9' }}>
                updates every 2s
              </span>
            )}
            {customerName && <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-ui)', marginLeft: 'auto' }}>with {customerName}</span>}
            {!customerName && <span style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-jetbrains-mono)', marginLeft: 'auto' }}>{messages.length} msgs</span>}
          </div>
          <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[0, 0.18, 0.36].map((d, i) => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#CBD5E1', animation: `rec-blink 1.2s ease-in-out ${d}s infinite` }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: '#334155', fontFamily: 'var(--font-ui)' }}>
                  {isEnterprise ? 'Waiting for conversation…' : 'Transcript will appear shortly…'}
                </span>
                {isEnterprise === false && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textAlign: 'center', maxWidth: 200 }}>
                    Full transcript available after call ends
                  </span>
                )}
              </div>
            ) : (
              messages.map((msg, i) => <MsgBubble key={i} msg={msg} agentName={agentName} customerName={customerName} />)
            )}
          </div>
        </div>

        {/* Right: Visualization */}
        <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', gap: 20, position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse 80% 70% at 50% 42%, rgba(124,110,250,0.09) 0%, transparent 72%)' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(124,110,250,0.13) 1px, transparent 1px)', backgroundSize: '26px 26px', opacity: 0.5, pointerEvents: 'none' }} />
          {[{ left: '28%', delay: '0s', size: 3, color: '#7C6EFA' }, { left: '52%', delay: '1.1s', size: 4, color: '#22D3EE' }, { left: '68%', delay: '2.2s', size: 3, color: '#7C6EFA' }, { left: '40%', delay: '0.5s', size: 5, color: '#22D3EE' }].map((p, i) => (
            <div key={i} style={{ position: 'absolute', bottom: '28%', left: p.left, width: p.size, height: p.size, borderRadius: '50%', background: p.color, opacity: 0, animation: `float-up 3.2s ease-out ${p.delay} infinite` }} />
          ))}

          <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            {[{ delay: '0s', colorA: 'rgba(124,110,250,0.7)', colorB: 'rgba(34,211,238,0.3)' }, { delay: '0.7s', colorA: 'rgba(34,211,238,0.5)', colorB: 'rgba(124,110,250,0.25)' }, { delay: '1.4s', colorA: 'rgba(168,154,249,0.4)', colorB: 'rgba(34,211,238,0.15)' }].map((r, i) => (
              <div key={i} style={{ position: 'absolute', width: 84, height: 84, borderRadius: '50%', border: '1.5px solid transparent', background: `linear-gradient(#080B14,#080B14) padding-box, linear-gradient(135deg,${r.colorA},${r.colorB}) border-box`, animation: `ring-expand 2.8s ease-out ${r.delay} infinite` }} />
            ))}
            <div style={{ width: 80, height: 80, borderRadius: '50%', zIndex: 2, background: 'radial-gradient(circle at 38% 34%, rgba(168,154,249,0.26), rgba(124,110,250,0.06) 70%, transparent)', border: '1.5px solid rgba(124,110,250,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'orb-breathe 3s ease-in-out infinite' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" style={{ position: 'relative', zIndex: 1 }}>
                <defs><linearGradient id="pg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#A89AF9"/><stop offset="100%" stopColor="#22D3EE"/></linearGradient></defs>
                <path stroke="url(#pg2)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 40, zIndex: 1 }}>
            {freqHeights.map((h, i) => (
              <div key={i} style={{ width: 3, borderRadius: 2, transformOrigin: 'center', background: i < 6 ? 'linear-gradient(to top,#7C6EFA,rgba(168,154,249,0.55))' : 'linear-gradient(to top,#22D3EE,rgba(34,211,238,0.55))', height: h, animation: `freq-bar 0.6s ease-in-out ${freqDelays[i]}s infinite` }} />
            ))}
          </div>

          <div style={{ textAlign: 'center', zIndex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.8)', animation: 'orb-breathe 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-ui)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Connected</span>
            </div>
            <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-jetbrains-mono), monospace', letterSpacing: '0.04em', background: 'linear-gradient(135deg, #E2E8F0 30%, #A89AF9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {fmtDur(duration)}
            </div>
            <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 6, letterSpacing: '0.04em' }}>{phone}</div>
            {customerName && <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-ui)', marginTop: 2 }}>{customerName}</div>}
          </div>

          <button
            onClick={async () => {
              const rid = callRecordIdRef.current;
              if (rid) {
                try { await endCallMutation.mutateAsync(rid); } catch {}
              }
              setCallState('ended');
              setEndReason('Ended manually');
              // Allow finalization time then fetch transcript
              if (rid) setTimeout(() => loadTranscript(rid), 3500);
            }}
            style={{ width: 56, height: 56, borderRadius: '50%', zIndex: 1, background: 'radial-gradient(circle at 38% 34%, rgba(239,68,68,0.2), rgba(239,68,68,0.06))', border: '1.5px solid rgba(239,68,68,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 0 28px rgba(239,68,68,0.2)', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'radial-gradient(circle,rgba(239,68,68,0.32),rgba(239,68,68,0.1))'; e.currentTarget.style.boxShadow = '0 0 44px rgba(239,68,68,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'radial-gradient(circle at 38% 34%,rgba(239,68,68,0.2),rgba(239,68,68,0.06))'; e.currentTarget.style.boxShadow = '0 0 28px rgba(239,68,68,0.2)'; }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
              <line x1="23" y1="1" x2="1" y2="23"/>
            </svg>
          </button>
          <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-ui)', letterSpacing: '0.08em', textTransform: 'uppercase', zIndex: 1 }}>End Call</span>
        </div>
      </div>
    );
  }

  // ── IDLE / CALLING ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#FFFFFF' }}>
      <style>{`
        @keyframes orb-spin   { to { transform: rotate(360deg); } }
        @keyframes idle-pulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.06);opacity:0.3} }
        @keyframes mic-wave   { 0%,100%{transform:scaleY(0.3);opacity:0.5} 50%{transform:scaleY(1);opacity:1} }
        @keyframes ring-pulse { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(1.8);opacity:0} }
        @keyframes spin-cw    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes dial-blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      {/* Left: Agent Visual + Prerequisites */}
      <div style={{
        flex: '0 0 44%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '36px 32px', borderRight: '1px solid #F1F5F9',
        background: 'radial-gradient(ellipse 90% 70% at 50% 46%, rgba(124,110,250,0.08) 0%, transparent 72%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(124,110,250,0.1) 1px, transparent 1px)', backgroundSize: '28px 28px', opacity: 0.4, pointerEvents: 'none' }} />

        {/* Orb */}
        <div style={{ position: 'relative', width: 112, height: 112, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 0deg, #7C6EFA, #22D3EE, #A89AF9, #7C6EFA)', animation: 'orb-spin 7s linear infinite', padding: 1.5 }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#F8FAFC' }} />
          </div>
          {isCalling ? (
            <>
              <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1px solid rgba(16,185,129,0.4)', animation: 'ring-pulse 1.4s ease-out infinite' }} />
              <div style={{ position: 'absolute', inset: -26, borderRadius: '50%', border: '1px solid rgba(16,185,129,0.2)', animation: 'ring-pulse 1.4s ease-out 0.5s infinite' }} />
            </>
          ) : (
            <>
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1px solid rgba(124,110,250,0.18)', animation: 'idle-pulse 3s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', inset: -22, borderRadius: '50%', border: '1px solid rgba(124,110,250,0.08)', animation: 'idle-pulse 3s ease-in-out 0.8s infinite' }} />
            </>
          )}
          <div style={{ width: 94, height: 94, borderRadius: '50%', position: 'relative', background: 'radial-gradient(circle at 38% 34%, rgba(168,154,249,0.2), rgba(124,110,250,0.06) 60%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(124,110,250,0.18)' }}>
            {isCalling ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" style={{ animation: 'dial-blink 1.2s ease-in-out infinite' }}>
                <defs><linearGradient id="dial-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#10B981"/><stop offset="100%" stopColor="#22D3EE"/></linearGradient></defs>
                <path stroke="url(#dial-g)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            ) : (
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {[6, 12, 18, 24, 18, 12, 6].map((h, i) => (
                  <div key={i} style={{ width: 3, height: h, borderRadius: 3, background: 'linear-gradient(to top, #7C6EFA, #22D3EE)', opacity: 0.75, animation: `mic-wave 1.8s ease-in-out ${i * 0.12}s infinite`, transformOrigin: 'bottom' }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent name + status */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', fontFamily: 'var(--font-display), sans-serif', marginBottom: 8 }}>{agentName}</div>
          {isCalling ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin-cw 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#10B981', fontFamily: 'var(--font-ui)', letterSpacing: '0.08em' }}>DIALING…</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: isSynced ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${isSynced ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.22)'}` }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSynced ? '#10B981' : '#F59E0B' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: isSynced ? '#10B981' : '#F59E0B', fontFamily: 'var(--font-ui)' }}>
                {isSynced ? 'Live on ElevenLabs' : 'Not synced to EL'}
              </span>
            </div>
          )}
        </div>

        {/* Prerequisites */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Prereq label="Agent saved" ok={!!agentId} hint="Save the agent first" />
          <Prereq label="Synced to ElevenLabs" ok={isSynced} hint={'Click "Sync to ElevenLabs" first'} />
          {elCxn === false && <Prereq label="ElevenLabs API key missing" ok={false} hint="Settings → Credentials" />}
          {twilioCxn === false && <Prereq label="Twilio credentials missing" ok={false} hint="Settings → Credentials" />}
          {!agentPhoneNumber && <Prereq label="No outbound number on agent" ok={false} hint="Edit agent → Config tab" />}
        </div>

        {/* Recent calls */}
        {pastCalls.length > 0 && !isCalling && (
          <div style={{ width: '100%', marginTop: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>Recent Calls</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pastCalls.map((call) => {
                const stColor = call.status === 'completed' ? '#10B981' : call.status === 'in-progress' ? '#F59E0B' : '#475569';
                const dur = call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : null;
                const when = call.created_at ? new Date(call.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                return (
                  <div key={call.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: stColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'var(--font-jetbrains-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{call.to_number ?? '—'}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{when}</div>
                    </div>
                    {dur && <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-jetbrains-mono)' }}>{dur}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right: Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 36px' }}>
        {twilioCxn === false ? <CredentialsRequired /> : (
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              {isCalling ? 'Initiating Call…' : 'Start Test Call'}
            </h3>
            <p style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-ui)', lineHeight: 1.6 }}>
              {isCalling
                ? 'Connecting to ElevenLabs and placing the call. This may take a few seconds.'
                : 'Enter the customer details below to start a live test call with your agent.'
              }
            </p>
          </div>

          {/* Customer name */}
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Customer Name <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></FieldLabel>
            <NameField
              value={customerName}
              onChange={setCustomerName}
              placeholder="e.g. John Smith"
              disabled={isCalling}
            />
          </div>

          {/* From number chip */}
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>From Number</FieldLabel>
            {agentPhoneNumber ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.18)', borderRadius: 10 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#22D3EE', letterSpacing: '0.04em' }}>{agentPhoneNumber}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'var(--font-ui)', lineHeight: 1.55 }}>
                  No number configured on this agent. <strong style={{ color: '#F59E0B' }}>The call will fail</strong> unless a default number is set in your environment. Go to <strong>Edit Agent → Config</strong> to add a number.
                </span>
              </div>
            )}
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 22 }}>
            <FieldLabel>Phone Number to Call</FieldLabel>
            <PhoneField
              value={phone}
              onChange={setPhone}
              onKeyDown={(e) => e.key === 'Enter' && canCall && !isCalling && handleStart()}
              disabled={isCalling}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 6, textAlign: 'center' }}>
              Format: +1 (555) 000-0000 or +44 7700 900000
            </div>
          </div>

          {/* Call button */}
          <button
            onClick={handleStart}
            disabled={!canCall || isCalling}
            style={{
              width: '100%',
              background: canCall && !isCalling
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : '#F1F5F9',
              border: canCall && !isCalling ? 'none' : '1px solid #E2E8F0',
              borderRadius: 13, padding: '15px 24px',
              fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700,
              color: canCall && !isCalling ? '#fff' : '#94A3B8',
              cursor: canCall && !isCalling ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: canCall && !isCalling ? '0 0 32px rgba(16,185,129,0.25), 0 4px 16px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { if (canCall && !isCalling) { e.currentTarget.style.boxShadow = '0 0 44px rgba(16,185,129,0.4), 0 4px 20px rgba(0,0,0,0.25)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
            onMouseLeave={(e) => { if (canCall && !isCalling) { e.currentTarget.style.boxShadow = '0 0 32px rgba(16,185,129,0.25), 0 4px 16px rgba(0,0,0,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
          >
            {isCalling ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin-cw 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Initiating Call…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Start Test Call
              </>
            )}
          </button>

          {isCalling && (
            <button
              onClick={handleCancel}
              style={{
                marginTop: 12, width: '100%',
                background: 'transparent',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 13, padding: '13px 24px',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                color: '#EF4444', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
                <line x1="23" y1="1" x2="1" y2="23"/>
              </svg>
              Cancel Call
            </button>
          )}

          {callError && (
            <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
              <div style={{ fontSize: 11, color: '#EF4444', fontFamily: 'var(--font-ui)', lineHeight: 1.55 }}>{callError}</div>
            </div>
          )}
          {!canCall && !isCalling && !callError && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 9, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.12)', fontSize: 11, color: '#64748B', fontFamily: 'var(--font-ui)', lineHeight: 1.55, textAlign: 'center' }}>
              {!agentId ? 'Save the agent first.' : !isSynced ? 'Sync to ElevenLabs before testing.' : 'Enter a valid phone number.'}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
