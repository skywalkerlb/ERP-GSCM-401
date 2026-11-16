import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { Skeleton } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { Select } from '@/components/Select';
import { useAuth, friendlyAuthError, signupFieldErrors, type AppRole, type Profile } from '@/hooks/useAuth';
import { homeFor } from '@/hooks/useRole';
import { isDemoConfigured, enterDemo, isDemo, supabase } from '@/lib/supabase';
import { ThemeToggle } from './ThemeToggle';

const DEMO_ROLES = [
  { value: 'owner', label: 'Owner' }, { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' }, { value: 'cashier', label: 'Cashier' },
  { value: 'baker', label: 'Baker' }, { value: 'customer', label: 'Customer' },
];

function DemoSelector() {
  const [role, setRole] = useState<AppRole>('manager');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openDemo() {
    setBusy(true); setError('');
    try { await enterDemo(role); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The demo could not open. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="auth-form" aria-label="Try the demo">
    <div className="auth-divider text-label">Try the demo</div>
    <p className="gz-muted text-body-sm">Choose a role to explore sample data. No username, password or account creation needed.</p>
    {error && <Alert tone="danger" title="Could not open demo">{error}</Alert>}
    <Select label="Demo role" options={DEMO_ROLES} value={role} onChange={(event) => setRole(event.target.value as AppRole)} disabled={busy} />
    <Button variant="secondary" onClick={() => void openDemo()} disabled={busy || !isDemoConfigured}>{busy ? 'Opening demo' : error ? 'Try demo again' : 'Enter demo'}</Button>
    {!isDemoConfigured && <p className="gz-muted text-body-sm">The demo is unavailable because setup is incomplete. Ask the platform owner to finish demo setup.</p>}
  </section>;
}

function hasAuthLinkError(): boolean {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return query.has('error') || query.has('error_code') || hash.has('error') || hash.has('error_code');
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [linkError] = useState(hasAuthLinkError);
  return (
    <div className="auth-page">
      <div className="auth-page__theme">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
          <h1 className="text-h1" style={{ margin: 0 }}>
            {title}
          </h1>
          <p className="gz-muted" style={{ margin: 0 }}>
            {subtitle}
          </p>
        </div>
        <Card>{linkError && <Alert tone="warning" title="This email link could not be used">The link may have expired or already been used. Request a new confirmation email from sign in, or request a new password reset link.</Alert>}{children}</Card>
      </div>
    </div>
  );
}

/** Where to go after signing in: staff to their home screen (or where they were headed), customers to /shop. */
function destination(profile: Profile, from: string | undefined): string {
  if (profile.role === 'customer') return from?.startsWith('/shop') ? from : '/shop';
  return from && !from.startsWith('/shop') && from !== '/login' ? from : homeFor(profile.role);
}

function useRedirectIfSignedIn(): ReactNode {
  const [linkError] = useState(hasAuthLinkError);
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton variant="block" />
        </div>
      </div>
    );
  }
  if (session && profile && !linkError) return <Navigate to={destination(profile, from)} replace />;
  return null;
}

function SignInForm() {
  const { signIn, profileError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(nextEmail: string, nextPassword: string) {
    setBusy(true);
    setError('');
    try {
      const result = await signIn(nextEmail, nextPassword);
      if (result.error) setError(result.error);
      else if (result.profile === null) setError('You are signed in, but your account has no role yet. Ask the platform owner to set it up.');
      else if (result.profile) navigate(destination(result.profile, (location.state as { from?: string } | null)?.from), { replace: true });
    } catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setBusy(false); }
  }

  async function resendConfirmation() {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: failure } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/login` } });
      if (failure) throw failure;
      setNotice('If your account needs confirmation, a link has been sent. Check your inbox.');
    } catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setBusy(false); }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(email, password);
  }

  return (
    <>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {(error || profileError) && <Alert tone="danger" title="Could not sign in">{error || profileError}</Alert>}
        {notice && <Alert tone="info" title="Check your email">{notice}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" variant="primary" size="lg" disabled={busy || !email || !password}>
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
      <p className="auth-foot text-body-sm"><Link className="gz-link" to="/forgot-password">Reset your password</Link></p>
      <Button variant="ghost" disabled={busy || !email.trim() || isDemo} onClick={() => void resendConfirmation()}>Resend confirmation email</Button>
    </>
  );
}

/** Staff sign in at /login. Customers who sign in here are sent to /shop. */
export function LoginPage() {
  const redirect = useRedirectIfSignedIn();
  if (redirect) return <>{redirect}</>;
  return (
    <AuthFrame title="Sign in to Glazed" subtitle="Orders, baking, stock and books for every shop.">
      <SignInForm />
      <p className="auth-foot text-body-sm">New here? <Link className="gz-link" to="/shop/signup">Create an account</Link>. New accounts can order in the shop. An administrator or manager can grant staff access.</p>
      <p className="auth-foot text-body-sm">
        Ordering donuts for pickup?{' '}
        <Link className="gz-link" to="/shop/login">
          Go to the shop
        </Link>
      </p>
      <DemoSelector />
    </AuthFrame>
  );
}

/** Customer sign in at /shop/login. */
export function PortalLoginPage() {
  const redirect = useRedirectIfSignedIn();
  if (redirect) return <>{redirect}</>;
  return (
    <AuthFrame title="Order fresh donuts" subtitle="Sign in to see what each shop has today and pick a pickup time.">
      <SignInForm />
      <p className="auth-foot text-body-sm">
        New here?{' '}
        <Link className="gz-link" to="/shop/signup">
          Create an account
        </Link>
        {' '}or{' '}
        <Link className="gz-link" to="/login">
          sign in as staff
        </Link>
      </p>
      <DemoSelector />
    </AuthFrame>
  );
}

/** Customer sign up at /shop/signup. A database trigger gives the new account a customer profile. */
export function PortalSignupPage() {
  const { signUp } = useAuth();
  const redirect = useRedirectIfSignedIn();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof signupFieldErrors>>({});
  if (redirect) return <>{redirect}</>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const invalid = signupFieldErrors({ email, password, fullName });
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    setBusy(true);
    try {
      const result = await signUp({ email, password, fullName });
      if (result.error) setError(result.error);
      else if (result.needsConfirmation) setNotice('If this is a new email address, check your inbox for a confirmation link, then sign in. If you already have an account, sign in or reset your password. New accounts receive customer access; an administrator or manager can grant staff access.');
    } catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setBusy(false); }
  }

  return (
    <AuthFrame title="Create your account" subtitle="Create a customer account to order ahead. Administrators and managers grant staff access.">
      {notice ? (
        <Alert tone="info" title="Check your email">
          {notice}
        </Alert>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {error && <Alert tone="danger" title="Could not create the account">{error}</Alert>}
          <TextField label="Full name" autoComplete="name" error={fieldErrors.fullName} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <TextField label="Email" type="email" autoComplete="email" error={fieldErrors.email} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField label="Password" type="password" autoComplete="new-password" error={fieldErrors.password} hint="At least 6 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" variant="primary" size="lg" disabled={busy || !fullName.trim() || !email.trim() || !password || isDemo}>
            {busy ? 'Creating account' : 'Create account'}
          </Button>
        </form>
      )}
      <p className="auth-foot text-body-sm">
        Already have an account?{' '}
        <Link className="gz-link" to="/shop/login">
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}


export function PasswordRecoveryPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/update-password` });
      if (failure) throw failure;
      setSent(true);
    } catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setBusy(false); }
  }
  return <AuthFrame title="Reset your password" subtitle="We will send you a link to choose a new password.">
    {sent ? <Alert tone="info" title="Check your email">If an account exists for that email, a reset link has been sent.</Alert> :
      <form className="auth-form" onSubmit={submit}>
        {error && <Alert tone="danger" title="Could not send the link">{error}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button variant="primary" type="submit" disabled={busy || isDemo}>{busy ? 'Sending link' : 'Send reset link'}</Button>
      </form>}
    <p className="auth-foot"><Link className="gz-link" to="/login">Back to sign in</Link></p>
  </AuthFrame>;
}

/** Handles password recovery and invited staff choosing their first password. */
export function PasswordUpdatePage() {
  const [linkError] = useState(hasAuthLinkError);
  const { session, loading, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password.length < 6) { setError('Use a password with at least 6 characters.'); return; }
    if (password !== confirmation) { setError('The passwords do not match. Enter the same password in both fields.'); return; }
    setBusy(true);
    try {
      const { error: failure } = await supabase.auth.updateUser({ password });
      if (failure) throw failure;
      await signOut();
      setSaved(true);
    } catch (cause) { setError(friendlyAuthError(cause)); }
    finally { setBusy(false); }
  }
  return <AuthFrame title="Choose your password" subtitle="Set a password to access your account.">
    {loading ? <Skeleton variant="block" /> : saved ? <Alert tone="success" title="Password saved">Sign in with your new password to continue.</Alert> : !session || linkError ?
      <Alert tone="warning" title="Open your email link">Use the latest invitation or password reset link. If it has expired, request another link.</Alert> :
      <form className="auth-form" onSubmit={submit}>
        {error && <Alert tone="danger" title="Could not save password">{error}</Alert>}
        <TextField label="New password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <TextField label="Confirm password" type="password" autoComplete="new-password" minLength={6} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <Button variant="primary" type="submit" disabled={busy || isDemo}>{busy ? 'Saving password' : 'Save password'}</Button>
      </form>}
    <p className="auth-foot"><Link className="gz-link" to="/login">Back to sign in</Link> · <Link className="gz-link" to="/forgot-password">Request a new reset link</Link></p>
  </AuthFrame>;
}
