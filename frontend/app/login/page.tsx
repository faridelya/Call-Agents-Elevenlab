'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

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

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    background: '#F8FAFC',
    border: `1px solid ${focusedField === field ? '#10B981' : '#E2E8F0'}`,
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 14,
    color: '#0F172A',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow: focusedField === field ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      fontFamily: 'var(--font-ui)',
    }}>

      {/* Subtle grid */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Top right decoration */}
      <div style={{
        position: 'fixed', top: '-100px', right: '-100px', width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(244,63,94,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '-80px', left: '-80px', width: 350, height: 350,
        background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1, animation: 'fade-in 0.5s both' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 40 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 14,
            background: 'linear-gradient(135deg, #F43F5E 0%, #F97316 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(244,63,94,0.30)',
          }}>
            <div style={{ display: 'flex', gap: 2.5, alignItems: 'center' }}>
              {[3, 7, 12, 7, 3].map((h, i) => (
                <div key={i} style={{
                  width: 2.5, height: h,
                  background: i === 2 ? '#fff' : 'rgba(255,255,255,0.65)',
                  borderRadius: 2,
                }} />
              ))}
            </div>
          </div>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26,
            color: '#0F172A', letterSpacing: '-0.04em',
          }}>
            voxara
          </span>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 24,
          padding: '36px 32px',
          boxShadow: '0 4px 24px rgba(15,23,42,0.08), 0 1px 4px rgba(15,23,42,0.04)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Top accent line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: 'linear-gradient(90deg, #F43F5E, #F59E0B, #10B981)',
            borderRadius: '24px 24px 0 0',
          }} />

          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
            color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 4,
          }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 28 }}>
            {mode === 'login' ? 'Sign in to your Voxara account' : 'Start building AI voice agents today'}
          </p>

          {/* Mode toggle */}
          <div style={{
            display: 'flex',
            background: '#F8FAFC',
            borderRadius: 12,
            padding: 4,
            marginBottom: 28,
            border: '1px solid #E2E8F0',
          }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
                  background: mode === m ? '#FFFFFF' : 'transparent',
                  color: mode === m ? '#0F172A' : '#64748B',
                  fontSize: 13.5, fontWeight: mode === m ? 700 : 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  transition: 'all 0.18s',
                  boxShadow: mode === m ? '0 1px 4px rgba(15,23,42,0.10)' : 'none',
                }}
              >
                {m === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {mode === 'register' && (
              <div>
                <label style={{
                  fontSize: 11.5, fontWeight: 700, color: '#64748B',
                  display: 'block', marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  Full name
                </label>
                <input
                  type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  required placeholder="Jane Doe"
                  style={inputStyle('name')}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            )}

            <div>
              <label style={{
                fontSize: 11.5, fontWeight: 700, color: '#64748B',
                display: 'block', marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                Email address
              </label>
              <input
                type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                required placeholder="jane@company.com"
                style={inputStyle('email')}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            <div>
              <label style={{
                fontSize: 11.5, fontWeight: 700, color: '#64748B',
                display: 'block', marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                Password
              </label>
              <input
                type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                required placeholder="••••••••"
                style={inputStyle('password')}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            {error && (
              <div style={{
                background: '#FFF1F2',
                border: '1px solid #FECDD3',
                borderRadius: 10, padding: '11px 14px',
                fontSize: 13, color: '#EF4444',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#94A3B8' : '#0F172A',
                border: 'none',
                borderRadius: 12,
                padding: '14px 0',
                fontSize: 14.5,
                fontWeight: 700,
                color: '#FFFFFF',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-ui)',
                transition: 'all 0.2s',
                marginTop: 4,
                letterSpacing: '-0.01em',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(15,23,42,0.20)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#1E293B';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,23,42,0.28)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = loading ? '#94A3B8' : '#0F172A';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 14px rgba(15,23,42,0.20)';
              }}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 20 }}>
          AI Voice Agent Platform · Powered by ElevenLabs + Twilio
        </p>
      </div>
    </div>
  );
}
