/**
 * Sign in / create account / password reset with Supabase Auth
 * (email + password). Usernames are validated client-side and again by the
 * signup trigger (which falls back to a generated username if taken).
 * After auth, the user returns to `?next=` (only same-origin paths allowed).
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { requireSupabase } from '@/lib/supabase';
import { USERNAME } from '@/lib/validation';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { ErrorMessage, Notice } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';

type Mode = 'signin' | 'signup' | 'forgot';

/** Only allow internal paths as post-login redirects (prevents open redirects). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function AuthPage() {
  const { user, configured, recovering } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { setError(null); setInfo(null); }, [mode]);

  if (!configured) {
    return (
      <AuthFrame title="Accounts are not configured">
        <Notice tone="warning">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README) to enable sign-in, private maps and collaboration.
          Discover still works with clearly labeled development sample data.
        </Notice>
        <Link to="/" className="mt-4 inline-block text-sm font-medium underline">Back to Discover</Link>
      </AuthFrame>
    );
  }
  if (recovering) return <ResetPassword />;
  if (user) return <Navigate to={next} replace />;

  const submit = async () => {
    setError(null);
    setInfo(null);
    const sb = requireSupabase();
    if (mode === 'signup') {
      if (!USERNAME.test(username)) return setError('Usernames are 3–30 characters: lowercase letters, numbers and underscores.');
      if (password.length < 8) return setError('Use a password of at least 8 characters.');
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: e } = await sb.auth.signInWithPassword({ email, password });
        if (e) throw e;
        navigate(next, { replace: true });
      } else if (mode === 'signup') {
        const { data, error: e } = await sb.auth.signUp({
          email, password,
          options: {
            data: { username, display_name: displayName.trim() },
            emailRedirectTo: `${window.location.origin}${next}`,
          },
        });
        if (e) throw e;
        if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
        else navigate(next, { replace: true });
      } else {
        const { error: e } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` });
        if (e) throw e;
        setInfo('If an account exists for that email, a reset link is on its way.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title={mode === 'signin' ? 'Sign in to Atlas' : mode === 'signup' ? 'Create your Atlas account' : 'Reset your password'}>
      {mode !== 'forgot' && (
        <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 rounded-lg bg-neutral-100 p-1">
          {(['signin', 'signup'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}
              className={cn('h-8 rounded-md text-sm font-medium', mode === m ? 'bg-white shadow-sm' : 'text-neutral-600')}>
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      )}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== 'forgot' && (
          <TextField label="Password" type="password" required minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
        {mode === 'signup' && (
          <>
            <TextField label="Username" required value={username} maxLength={30}
              onChange={(e) => setUsername(e.target.value.toLowerCase())} hint="Lowercase letters, numbers and _ (3–30). Friends can find you by it." />
            <TextField label="Display name (optional)" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
          </>
        )}
        {error && <ErrorMessage error={error} />}
        {info && <Notice>{info}</Notice>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-xs text-neutral-600">
        {mode === 'forgot'
          ? <button type="button" className="underline" onClick={() => setMode('signin')}>Back to sign in</button>
          : <button type="button" className="underline" onClick={() => setMode('forgot')}>Forgot password?</button>}
        <Link to="/" className="underline">Continue to Discover</Link>
      </div>
    </AuthFrame>
  );
}

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthFrame title="Choose a new password">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 8) return setError('Use at least 8 characters.');
        setBusy(true);
        const { error: err } = await requireSupabase().auth.updateUser({ password });
        setBusy(false);
        if (err) setError(err.message);
        else { window.location.hash = ''; navigate('/', { replace: true }); window.location.reload(); }
      }}>
        <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <ErrorMessage error={error} />}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>Update password</Button>
      </form>
    </AuthFrame>
  );
}

export function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,#ffffff,#ececec)] p-6">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-7 shadow-float ring-1 ring-black/5">
        <Link to="/" className="mb-5 flex items-center gap-2 text-sm font-semibold"><img src="/atlas.svg" alt="" className="size-6" />Atlas</Link>
        <h1 className="mb-5 text-xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}
