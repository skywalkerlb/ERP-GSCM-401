import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { friendlyAuthError, useAuth } from '@/hooks/useAuth';
import { isDemo, supabase } from '@/lib/supabase';
import { selectBusiness, type BusinessContext } from '@/lib/businessContext';
import { onboardingAction } from '@/lib/onboarding';
import { appPath } from '@/lib/appUrl';
import { AuthFrame } from './AuthPages';

export default function CreateBusinessPage() {
  const { session, signIn, signOut } = useAuth();
  const [existing, setExisting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [requestId] = useState(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem('glazed-business-create-request-v1'); } catch { /* Keep retries idempotent within this page. */ }
    const id = saved || crypto.randomUUID();
    try { sessionStorage.setItem('glazed-business-create-request-v1', id); } catch { /* Business selection will explain blocked site storage. */ }
    return id;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function account(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (existing) {
        const result = await signIn(email.trim(), password);
        if (result.error) throw new Error(result.error);
      } else {
        const result = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { registration_intent: 'business' } } });
        if (result.error) throw new Error(friendlyAuthError(result.error));
        if (!result.data.session) throw new Error('Use Sign in below if this account already exists.');
      }
      setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not access your account. Try again.'); }
    finally { setBusy(false); }
  }
  async function finish(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await onboardingAction<BusinessContext>({ action: 'create', business_name: businessName.trim(), location_name: locationName.trim(), location_address: address.trim(), request_id: requestId });
      selectBusiness(result);
      sessionStorage.removeItem('glazed-business-create-request-v1');
      window.location.assign(appPath('/'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create your business. Try again.'); }
    finally { setBusy(false); }
  }
  return <AuthFrame title="Create your business">
    {isDemo ? <Alert tone="info" title="Exit the demo to create a business" /> : <>
      {error && <Alert tone="danger" title="Could not continue">{error}</Alert>}
      {!session ? <form className="auth-form" onSubmit={account}>
        <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
        <TextField label="Password" type="password" autoComplete={existing ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Continuing' : existing ? 'Sign in and continue' : 'Create owner account'}</Button>
        <Button variant="ghost" type="button" disabled={busy} onClick={() => { setExisting(!existing); setError(''); }}>{existing ? 'Create a new account' : 'Sign in to an existing account'}</Button>
      </form> : <form className="auth-form" onSubmit={finish}>
        <p className="gz-muted text-body-sm">Owner: {session.user.email}</p>
        <TextField label="Business name" required maxLength={120} value={businessName} onChange={e => setBusinessName(e.target.value)} disabled={busy} />
        <TextField label="First shop name" required maxLength={120} value={locationName} onChange={e => setLocationName(e.target.value)} disabled={busy} />
        <TextField label="Shop address" required maxLength={500} value={address} onChange={e => setAddress(e.target.value)} disabled={busy} />
        <Button variant="primary" type="submit" disabled={busy || !businessName.trim() || !locationName.trim() || !address.trim()}>{busy ? 'Creating business' : 'Create business'}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void signOut().catch(() => setError('Could not sign out. Try again.'))}>Use another account</Button>
      </form>}
    </>}
    <p className="auth-foot text-body-sm"><Link className="gz-link" to="/login">Back to sign in</Link></p>
  </AuthFrame>;
}
