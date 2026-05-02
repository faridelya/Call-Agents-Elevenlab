'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(6,15,26,0.8)',
  border: '1px solid rgba(0,208,130,0.15)',
  borderRadius: 10,
  padding: '12px 14px',
  fontSize: 14,
  color: '#F1F5F9',
  fontFamily: 'var(--font-inter), sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
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
        background: '#060F1A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Dot grid overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(0,208,130,0.035) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Primary green aurora */}
      <div
        style={{
          position: 'fixed',
          top: '25%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 700,
          height: 600,
          background: 'radial-gradient(ellipse, rgba(0,208,130,0.09) 0%, rgba(0,194,184,0.05) 40%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* Bottom teal glow */}
      <div
        style={{
          position: 'fixed',
          bottom: '10%',
          right: '15%',
          width: 400,
          height: 400,
          background: 'radial-gradient(ellipse, rgba(56,189,248,0.05) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, animation: 'fade-in 0.6s both' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 36 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: 'rgba(0,208,130,0.12)',
              borderRadius: 11,
              border: '1px solid rgba(0,208,130,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(0,208,130,0.15)',
            }}
          >
            <div style={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              {[5, 9, 14, 9, 5].map((h, i) => (
                <div
                  key={i}
                  style={{
                    width: 2,
                    height: h,
                    background: '#00D082',
                    borderRadius: 1,
                    opacity: [0.4, 0.65, 1, 0.65, 0.4][i],
                  }}
                />
              ))}
            </div>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-syne), sans-serif',
              fontWeight: 800,
              fontSize: 24,
              color: '#F1F5F9',
              letterSpacing: '-0.03em',
            }}
          >
            voxara
          </span>
        </div>

        {/* Glass Card */}
        <div
          style={{
            background: 'rgba(9,20,38,0.65)',
            border: '1px solid rgba(0,208,130,0.18)',
            borderRadius: 20,
            padding: '36px 32px',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,208,130,0.06)',
            backdropFilter: 'blur(24px) saturate(160%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* top accent line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, transparent, #00D082, #00C2B8, transparent)',
            opacity: 0.7,
          }} />

          <h1
            style={{
              fontFamily: 'var(--font-syne), sans-serif',
              fontSize: 22,
              fontWeight: 800,
              color: '#F1F5F9',
              letterSpacing: '-0.025em',
              marginBottom: 4,
            }}
          >
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ fontSize: 13, color: '#4A6080', marginBottom: 28, fontFamily: 'var(--font-inter), sans-serif' }}>
            {mode === 'login' ? 'Sign in to your Voxara account' : 'Start building AI voice agents today'}
          </p>

          {/* Mode toggle */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(6,15,26,0.8)',
              borderRadius: 10,
              padding: 3,
              marginBottom: 26,
              border: '1px solid rgba(0,208,130,0.1)',
            }}
          >
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: mode === m ? 'rgba(0,208,130,0.12)' : 'transparent',
                  color: mode === m ? '#00D082' : '#4A6080',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-syne), sans-serif',
                  transition: 'all 0.2s',
                  boxShadow: mode === m ? '0 1px 8px rgba(0,208,130,0.15)' : 'none',
                  letterSpacing: '0.01em',
                }}
              >
                {m === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mode === 'register' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#4A6080', display: 'block', marginBottom: 7, fontFamily: 'var(--font-syne), sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Jane Doe"
                  style={INPUT_STYLE}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(0,208,130,0.55)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(0,208,130,0.08)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(0,208,130,0.15)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4A6080', display: 'block', marginBottom: 7, fontFamily: 'var(--font-syne), sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@company.com"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(0,208,130,0.55)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,208,130,0.08)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(0,208,130,0.15)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4A6080', display: 'block', marginBottom: 7, fontFamily: 'var(--font-syne), sans-serif', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={INPUT_STYLE}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(0,208,130,0.55)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,208,130,0.08)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(0,208,130,0.15)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#EF4444',
                  fontFamily: 'var(--font-inter), sans-serif',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading
                  ? 'rgba(0,208,130,0.15)'
                  : 'linear-gradient(135deg, rgba(0,208,130,0.22) 0%, rgba(0,194,184,0.14) 100%)',
                border: loading
                  ? '1px solid rgba(0,208,130,0.15)'
                  : '1px solid rgba(0,208,130,0.50)',
                borderRadius: 10,
                padding: '13px 0',
                fontSize: 14,
                fontWeight: 600,
                color: loading ? 'rgba(0,208,130,0.5)' : '#00D082',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-syne), sans-serif',
                transition: 'all 0.25s',
                marginTop: 4,
                boxShadow: loading ? 'none' : '0 4px 24px rgba(0,208,130,0.18)',
                letterSpacing: '0.04em',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,208,130,0.32)';
                  e.currentTarget.style.borderColor = 'rgba(0,208,130,0.70)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,208,130,0.18)';
                e.currentTarget.style.borderColor = 'rgba(0,208,130,0.50)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#1E293B', marginTop: 20, fontFamily: 'var(--font-inter), sans-serif' }}>
          AI Voice Agent Platform · Powered by ElevenLabs + Twilio
        </p>
      </div>
    </div>
  );
}
