'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutboundCall } from '@/lib/hooks/useCalls';
import { useEventStream, type LiveEvent } from '@/lib/hooks/useEventStream';

// ─── Types ────────────────────────────────────────────────────────────────────

type CallState = 'idle' | 'calling' | 'connected' | 'ended';

interface TranscriptMsg {
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TestCallPanel({
  agentId,
  agentName,
  isSynced,
  onCallEnded,
}: {
  agentId: string | null;
  agentName: string;
  isSynced: boolean;
  onCallEnded?: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [callRecordId, setCallRecordId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMsg[]>([]);
  const [duration, setDuration] = useState(0);
  const [endReason, setEndReason] = useState('Call completed');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callRecordIdRef = useRef<string | null>(null);

  const outboundCall = useOutboundCall();

  // Keep ref in sync for use inside the callback closure
  useEffect(() => { callRecordIdRef.current = callRecordId; }, [callRecordId]);

  // Live event stream
  useEventStream(
    useCallback((event: LiveEvent) => {
      const rid = callRecordIdRef.current;
      if (!rid) return;
      if (event.type === 'call_started' && event.call_record_id === rid) {
        setCallState('connected');
      } else if (event.type === 'call_ended' && event.call_record_id === rid) {
        setCallState('ended');
        setEndReason('Call completed');
        onCallEnded?.();
      } else if (event.type === 'transcript' && event.call_record_id === rid) {
        setMessages((prev) => [...prev, { role: event.role, text: event.text, timestamp: event.timestamp }]);
      }
    }, [onCallEnded])
  );

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  // Duration timer when connected
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  async function handleStart() {
    if (!agentId || !phone) return;
    setCallState('calling');
    try {
      const record = await outboundCall.mutateAsync({ agent_id: agentId, to_number: phone });
      setCallRecordId(record.id);
      callRecordIdRef.current = record.id;
    } catch {
      setCallState('idle');
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

  const canCall = !!agentId && isSynced && phone.trim().length >= 7;

  // ── ENDED ─────────────────────────────────────────────────────────────────
  if (callState === 'ended') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32 }}>
        <style>{`@keyframes check-pop{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}`}</style>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '1.5px solid rgba(16,185,129,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'check-pop 0.4s ease forwards' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 20, fontWeight: 700, color: '#F1F5F9', marginBottom: 6 }}>Call Ended</h3>
          <p style={{ fontSize: 13, color: '#64748B', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>Duration · {fmtDur(duration)}</p>
          <p style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-inter), sans-serif', marginTop: 4 }}>{endReason}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={handleReset} style={{ background: 'transparent', border: '1px solid rgba(124,110,250,0.3)', borderRadius: 10, padding: '9px 22px', fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 600, color: '#A89AF9', cursor: 'pointer', transition: 'all 0.15s' }}>
            Make Another Call
          </button>
        </div>
        {messages.length > 0 && (
          <div style={{ width: '100%', maxWidth: 500, background: '#0A0F1E', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', fontFamily: 'var(--font-inter)', marginBottom: 10 }}>Conversation · {messages.length} messages</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
              {messages.map((m, i) => <MsgBubble key={i} msg={m} agentName={agentName} />)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── IDLE / CALLING ────────────────────────────────────────────────────────
  if (callState === 'idle' || callState === 'calling') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px 24px', gap: 0 }}>
        <style>{`
          @keyframes spin-ring{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          @keyframes idle-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        `}</style>

        {/* Agent badge */}
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 72, height: 72 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'radial-gradient(circle at 38% 32%, rgba(124,110,250,0.28), rgba(124,110,250,0.04))', border: '1.5px solid rgba(124,110,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'idle-float 3s ease-in-out infinite' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#A89AF9" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9', fontFamily: 'var(--font-syne), sans-serif', marginBottom: 5 }}>{agentName}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: isSynced ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${isSynced ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.22)'}`, fontSize: 11, color: isSynced ? '#10B981' : '#F59E0B', fontFamily: 'var(--font-inter)', fontWeight: 600 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
              {isSynced ? 'Live on ElevenLabs' : 'Not synced to EL'}
            </span>
          </div>
        </div>

        {/* Prerequisites */}
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 420 }}>
          {[
            { label: 'Agent saved', ok: !!agentId, hint: 'Save the agent first' },
            { label: 'Synced to ElevenLabs', ok: isSynced, hint: 'Click "Go Live" after saving' },
          ].map(({ label, ok, hint }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 9, background: ok ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)', border: `1px solid ${ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'}` }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: ok ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: ok ? '#10B981' : '#F59E0B', fontWeight: 700 }}>{ok ? '✓' : '!'}</span>
              </div>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-inter)', color: ok ? '#94A3B8' : '#64748B', flex: 1 }}>{label}</span>
              {!ok && <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-inter)' }}>{hint}</span>}
            </div>
          ))}
        </div>

        {/* Phone input */}
        <div style={{ width: '100%', maxWidth: 420, marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-inter)' }}>
            Phone number to call
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canCall && handleStart()}
            placeholder="+1 (555) 000-0000"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#080B14', borderRadius: 12, padding: '14px 18px',
              fontSize: 20, fontFamily: 'var(--font-jetbrains-mono), monospace',
              color: '#F1F5F9', outline: 'none', textAlign: 'center',
              letterSpacing: '0.06em', transition: 'border-color 0.2s, box-shadow 0.2s',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,110,250,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,110,250,0.08)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>

        {/* Call button */}
        <button
          onClick={handleStart}
          disabled={!canCall || callState === 'calling'}
          style={{
            width: '100%', maxWidth: 420,
            background: canCall && callState === 'idle' ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : '#131B2E',
            border: canCall && callState === 'idle' ? 'none' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '14px 24px',
            fontFamily: 'var(--font-inter)', fontSize: 14, fontWeight: 700,
            color: canCall && callState === 'idle' ? '#fff' : '#334155',
            cursor: canCall ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: canCall && callState === 'idle' ? '0 0 28px rgba(16,185,129,0.22)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {callState === 'calling' ? (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin-ring 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Initiating call…
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Start Test Call
            </>
          )}
        </button>
      </div>
    );
  }

  // ── CONNECTED — split view ────────────────────────────────────────────────
  const freqDelays  = [0, 0.12, 0.24, 0.08, 0.32, 0.16, 0.4, 0.04, 0.28, 0.2, 0.36, 0.06];
  const freqHeights = [8, 18, 28, 22, 14, 32, 20, 10, 26, 16, 24, 12];

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <style>{`
        @keyframes ring-expand {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes orb-breathe {
          0%,100% { box-shadow: 0 0 28px rgba(124,110,250,0.3), 0 0 60px rgba(124,110,250,0.1); }
          50%      { box-shadow: 0 0 44px rgba(124,110,250,0.55), 0 0 90px rgba(124,110,250,0.18), 0 0 140px rgba(34,211,238,0.07); }
        }
        @keyframes freq-bar { 0%,100%{transform:scaleY(0.25)} 50%{transform:scaleY(1)} }
        @keyframes msg-enter { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rec-blink  { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes hdr-wave   { 0%,100%{height:3px} 50%{height:14px} }
        @keyframes float-up   {
          0%   { transform:translateY(0) scale(1); opacity:0.55; }
          100% { transform:translateY(-80px) scale(0); opacity:0; }
        }
      `}</style>

      {/* ── Left: Live Transcript ── */}
      <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(90deg,#0C1120,#0D1226)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.9)', animation: 'rec-blink 1.4s ease-in-out infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: 'var(--font-inter)' }}>Live Transcript</span>
          <div style={{ display: 'flex', gap: 2.5, alignItems: 'center', marginLeft: 8 }}>
            {[0, 0.1, 0.2, 0.1, 0].map((delay, i) => (
              <div key={i} style={{ width: 2.5, height: 3, background: 'linear-gradient(to top,#7C6EFA,#22D3EE)', borderRadius: 2, transformOrigin: 'bottom', animation: `hdr-wave 0.75s ease-in-out ${delay}s infinite` }} />
            ))}
          </div>
          <span style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--font-jetbrains-mono)', marginLeft: 'auto' }}>{messages.length} msgs</span>
        </div>

        {/* Messages */}
        <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {[0, 0.18, 0.36].map((d, i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E2A3D', animation: `rec-blink 1.2s ease-in-out ${d}s infinite` }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: '#334155', fontFamily: 'var(--font-inter)' }}>Waiting for conversation…</span>
            </div>
          ) : (
            messages.map((msg, i) => <MsgBubble key={i} msg={msg} agentName={agentName} />)
          )}
        </div>
      </div>

      {/* ── Right: Call Visualization ── */}
      <div style={{
        flex: '0 0 45%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '24px 20px', gap: 20,
        position: 'relative', overflow: 'hidden',
        background: 'radial-gradient(ellipse 80% 70% at 50% 42%, rgba(124,110,250,0.09) 0%, transparent 72%)',
      }}>
        {/* Dot-grid atmosphere */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(124,110,250,0.13) 1px, transparent 1px)', backgroundSize: '26px 26px', opacity: 0.55, pointerEvents: 'none' }} />

        {/* Floating particles */}
        {[
          { left: '28%', delay: '0s',   size: 3, color: '#7C6EFA' },
          { left: '52%', delay: '1.1s', size: 4, color: '#22D3EE' },
          { left: '68%', delay: '2.2s', size: 3, color: '#7C6EFA' },
          { left: '40%', delay: '0.5s', size: 5, color: '#22D3EE' },
          { left: '60%', delay: '1.7s', size: 3, color: '#A89AF9' },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: '28%', left: p.left,
            width: p.size, height: p.size, borderRadius: '50%',
            background: p.color, opacity: 0,
            animation: `float-up 3.2s ease-out ${p.delay} infinite`,
          }} />
        ))}

        {/* Orb + gradient-border rings */}
        <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          {[
            { delay: '0s',    colorA: 'rgba(124,110,250,0.7)', colorB: 'rgba(34,211,238,0.3)'  },
            { delay: '0.7s',  colorA: 'rgba(34,211,238,0.5)',  colorB: 'rgba(124,110,250,0.25)' },
            { delay: '1.4s',  colorA: 'rgba(168,154,249,0.4)', colorB: 'rgba(34,211,238,0.15)' },
            { delay: '2.1s',  colorA: 'rgba(124,110,250,0.3)', colorB: 'transparent'            },
          ].map((r, i) => (
            <div key={i} style={{
              position: 'absolute', width: 92, height: 92, borderRadius: '50%',
              border: '1.5px solid transparent',
              background: `linear-gradient(#080B14,#080B14) padding-box, linear-gradient(135deg,${r.colorA},${r.colorB}) border-box`,
              animation: `ring-expand 2.8s ease-out ${r.delay} infinite`,
            }} />
          ))}

          {/* Central orb */}
          <div style={{
            width: 86, height: 86, borderRadius: '50%', zIndex: 2,
            background: 'radial-gradient(circle at 38% 34%, rgba(168,154,249,0.26), rgba(124,110,250,0.06) 70%, transparent)',
            border: '1.5px solid rgba(124,110,250,0.42)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'orb-breathe 3s ease-in-out infinite',
          }}>
            <div style={{ position: 'absolute', width: 58, height: 58, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,110,250,0.18), transparent 70%)' }} />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" style={{ position: 'relative', zIndex: 1 }}>
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#A89AF9"/>
                  <stop offset="100%" stopColor="#22D3EE"/>
                </linearGradient>
              </defs>
              <path stroke="url(#pg)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.08a16 16 0 0 0 6.88 6.88l1.41-1.41a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
        </div>

        {/* Frequency equalizer bars */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 40, zIndex: 1 }}>
          {freqHeights.map((h, i) => (
            <div key={i} style={{
              width: 3, borderRadius: 2, transformOrigin: 'center',
              background: i < 6 ? 'linear-gradient(to top,#7C6EFA,rgba(168,154,249,0.55))' : 'linear-gradient(to top,#22D3EE,rgba(34,211,238,0.55))',
              height: h, animation: `freq-bar 0.6s ease-in-out ${freqDelays[i]}s infinite`,
            }} />
          ))}
        </div>

        {/* Status chip + giant timer */}
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.8)', animation: 'orb-breathe 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-inter)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Connected</span>
          </div>
          <div style={{
            fontSize: 54, fontWeight: 700, lineHeight: 1,
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            letterSpacing: '0.04em',
            background: 'linear-gradient(135deg, #E2E8F0 30%, #A89AF9 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {fmtDur(duration)}
          </div>
          <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-jetbrains-mono), monospace', marginTop: 6, letterSpacing: '0.04em' }}>{phone}</div>
        </div>

        {/* End call button */}
        <button
          onClick={() => { setCallState('ended'); setEndReason('Ended manually'); }}
          style={{
            width: 58, height: 58, borderRadius: '50%', zIndex: 1,
            background: 'radial-gradient(circle at 38% 34%, rgba(239,68,68,0.2), rgba(239,68,68,0.06))',
            border: '1.5px solid rgba(239,68,68,0.42)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 0 28px rgba(239,68,68,0.2), inset 0 1px 0 rgba(239,68,68,0.15)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'radial-gradient(circle,rgba(239,68,68,0.32),rgba(239,68,68,0.1))'; e.currentTarget.style.boxShadow = '0 0 44px rgba(239,68,68,0.5),inset 0 1px 0 rgba(239,68,68,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'radial-gradient(circle at 38% 34%,rgba(239,68,68,0.2),rgba(239,68,68,0.06))'; e.currentTarget.style.boxShadow = '0 0 28px rgba(239,68,68,0.2),inset 0 1px 0 rgba(239,68,68,0.15)'; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
            <line x1="23" y1="1" x2="1" y2="23"/>
          </svg>
        </button>
        <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-inter)', letterSpacing: '0.08em', textTransform: 'uppercase', zIndex: 1 }}>End Call</span>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg, agentName }: { msg: TranscriptMsg; agentName: string }) {
  const isAgent = msg.role === 'agent';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-start' : 'flex-end', gap: 3, animation: 'msg-enter 0.25s ease forwards' }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-inter)', color: isAgent ? '#A89AF9' : '#22D3EE' }}>
        {isAgent ? agentName : 'Customer'}
      </span>
      <div style={{
        maxWidth: '82%',
        background: isAgent ? 'rgba(124,110,250,0.11)' : 'rgba(34,211,238,0.08)',
        border: `1px solid ${isAgent ? 'rgba(124,110,250,0.18)' : 'rgba(34,211,238,0.13)'}`,
        borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '9px 13px', fontSize: 13, color: '#E2E8F0', lineHeight: 1.6,
        fontFamily: 'var(--font-inter), sans-serif',
      }}>
        {msg.text}
      </div>
      <span style={{ fontSize: 9, color: '#334155', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
        {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}
