'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: '#0F1623',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '11px 14px',
  fontSize: 14,
  color: '#F1F5F9',
  fontFamily: 'var(--font-inter), sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const BTN_PRIMARY: React.CSSProperties = {
  width: '100%',
  background: '#7C6EFA',
  border: 'none',
  borderRadius: 9,
  padding: '12px 0',
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'var(--font-inter), sans-serif',
  transition: 'opacity 0.15s',
  marginTop: 8,
};

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#080B14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'fixed',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(124,110,250,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: 'rgba(124,110,250,0.2)',
              borderRadius: 9,
              border: '1px solid rgba(124,110,250,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              {[5, 9, 14, 9, 5].map((h, i) => (
                <div key={i} style={{ width: 2, height: h, background: '#7C6EFA', borderRadius: 1, opacity: [0.5, 0.75, 1, 0.75, 0.5][i] }} />
              ))}
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: 22, color: '#F1F5F9', letterSpacing: '-0.02em' }}>
            voxara
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#0C1120',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
            padding: '32px 28px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-syne), sans-serif',
              fontSize: 20,
              fontWeight: 700,
              color: '#F1F5F9',
              letterSpacing: '-0.02em',
              marginBottom: 4,
            }}
          >
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 24 }}>
            {mode === 'login' ? 'Sign in to your Voxara account' : 'Start building AI voice agents today'}
          </p>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#080B14', borderRadius: 8, padding: 3, marginBottom: 24 }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 6,
                  border: 'none',
                  background: mode === m ? '#0F1623' : 'transparent',
                  color: mode === m ? '#F1F5F9' : '#475569',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter), sans-serif',
                  transition: 'all 0.15s',
                  boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                {m === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 6 }}>
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Jane Doe"
                  style={INPUT_STYLE}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(124,110,250,0.5)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@company.com"
                style={INPUT_STYLE}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(124,110,250,0.5)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={INPUT_STYLE}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(124,110,250,0.5)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#EF4444',
                }}
              >
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ ...BTN_PRIMARY, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#334155', marginTop: 20 }}>
          AI Voice Agent Platform · Powered by ElevenLabs + Twilio
        </p>
      </div>
    </div>
  );
}
