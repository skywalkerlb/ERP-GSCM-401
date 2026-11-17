import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { Skeleton } from '@/components/Skeleton';
import { TextField } from '@/components/TextField';
import { friendlyAuthError, useAuth } from '@/hooks/useAuth';
import { isDemo, supabase } from '@/lib/supabase';
import { onboardingAction, type OnboardingStatus, type SetupLocation } from '@/lib/onboarding';
import { usernameFromEmail } from '../../supabase/functions/_shared/identity';
import { AuthFrame } from './AuthPages';

export default function CreateBusinessPage() {
  const { session, profile, loading, signIn, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ['business-setup-status'], queryFn: () => onboardingAction<OnboardingStatus>({ action: 'status' }), enabled: !isDemo, retry: false });
  const [existing, setExisting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<SetupLocation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const accountEmail = session?.user?.email;
  const emailAccount = Boolean(accountEmail && !usernameFromEmail(accountEmail));

  async function account(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (existing) {
        const result = await signIn(email.trim().toLowerCase(), password);
        if (result.error) throw new Error(result.error);
      } else {
        const result = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
        if (result.error) throw new Error(friendlyAuthError(result.error));
        if (!result.data.session) throw new Error('Your account may already exist. Use an existing account below, or reset its password from sign in. If this is a new account, ask the platform owner to check signup configuration.');
      }
      setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not access your account. Try again.'); }
    finally { setBusy(false); }
  }
  async function unlock(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await onboardingAction<{ locations: SetupLocation[] }>({ action: 'locations', setup_code: code });
      setLocations(result.locations); setLocationId(result.locations.length ? String(result.locations[0].id) : '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not check setup. Try again.'); }
    finally { setBusy(false); }
  }
  async function finish(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!completed) {
        await onboardingAction({ action: 'complete', setup_code: code, business_name: businessName.trim(), location_id: locationId ? Number(locationId) : null, location_name: locationName.trim(), location_address: address.trim() });
        setCompleted(true); setCode('');
      }
      const profile = await refreshProfile();
      if (profile?.role !== 'owner') throw new Error('Business setup was saved. Your access could not refresh yet. Retry to open People, or sign in again.');
      navigate('/people', { replace: true, state: { businessCreated: true } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not finish setup. Try again.'); }
    finally { setBusy(false); }
  }
  async function switchAccount() {
    setBusy(true); setError('');
    try { await signOut(); setLocations(null); setCode(''); }
    catch { setError('Could not sign out. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  return <AuthFrame title="Create your business" subtitle="Set up this installation once, then invite your team.">
    {isDemo ? <Alert tone="info" title="Exit the demo to set up a business">Business setup is available only outside the demo.</Alert> : loading || status.isPending ? <Skeleton variant="block" /> : status.isError ?
      <Alert tone="warning" title="Business setup is unavailable" action={<Button onClick={() => void status.refetch()}>Try again</Button>}>Ask the platform owner to finish backend setup, or check your connection.</Alert> : profile?.role === 'owner' ? <Alert tone="success" title="Your business is ready" action={<Button onClick={() => navigate('/people', { replace: true, state: { businessCreated: true } })}>Open People</Button>}>Invite your admins and staff to create their accounts.</Alert> : !status.data?.available && !completed ?
      <Alert tone="info" title="Business setup is closed or unavailable">If the business is already set up, ask the owner to invite you as an admin or employee. Otherwise, ask the platform owner to finish setup configuration.</Alert> : <>
      {error && <Alert tone="danger" title="Could not finish setup">{error}</Alert>}
      {!session ? <form className="auth-form" onSubmit={account}>
        <p className="gz-muted text-body-sm">{existing ? 'Sign in with your existing email account to continue setup.' : 'Create your owner account. Your email will be your username. A private setup code is required to grant owner access.'}</p>
        <TextField label="Email" type="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
        <TextField label="Password" type="password" autoComplete={existing ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} hint="At least 6 characters." />
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Continuing' : existing ? 'Sign in and continue' : 'Create account and continue'}</Button>
        <Button variant="ghost" type="button" disabled={busy} onClick={() => { setExisting(!existing); setError(''); }}>{existing ? 'Create a new account' : 'Use an existing account'}</Button>
      </form> : !emailAccount ? <>
        <Alert tone="warning" title="Use an email account">Your current account uses a username. Sign out and create or sign in with an email account to set up the business.</Alert>
        <Button disabled={busy} onClick={() => void switchAccount()}>Sign out</Button>
      </> : completed ? <form className="auth-form" onSubmit={finish}>
        <Alert tone="success" title="Business setup saved">Refresh your owner access to invite your team.</Alert>
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Opening People' : 'Open People'}</Button>
      </form> : <>
        <p className="gz-muted text-body-sm">Setting up as <strong>{accountEmail}</strong>. This email is your username.</p>
        {locations === null ? <form className="auth-form" onSubmit={unlock}>
          <TextField label="Private setup code" type="password" autoComplete="off" required maxLength={256} value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} hint="Use the code provided privately by the person who configured this installation." />
          <Button variant="primary" type="submit" disabled={busy || !code}>{busy ? 'Checking code' : 'Continue business setup'}</Button>
        </form> : <form className="auth-form" onSubmit={finish}>
          <TextField label="Business name" required maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} disabled={busy} />
          {locations.length ? <Select label="First shop" hint="Select an existing location. Its name, address and business records will be preserved." options={locations.map((location) => ({ value: String(location.id), label: location.name }))} value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={busy} /> : <>
            <TextField label="First shop name" required maxLength={120} value={locationName} onChange={(event) => setLocationName(event.target.value)} disabled={busy} />
            <TextField label="Shop address" required maxLength={500} value={address} onChange={(event) => setAddress(event.target.value)} disabled={busy} />
            <p className="gz-muted text-body-sm">The shop starts with 7.25% sales tax. You can edit tax settings later.</p>
          </>}
          <Button variant="primary" type="submit" disabled={busy || !businessName.trim() || (!locations.length && (!locationName.trim() || !address.trim()))}>{busy ? 'Creating business' : 'Create business and invite team'}</Button>
        </form>}
        <p className="auth-foot"><Button variant="ghost" disabled={busy} onClick={() => void switchAccount()}>Use another account</Button></p>
      </>}
    </>}
    <p className="auth-foot text-body-sm"><Link className="gz-link" to="/login">Back to sign in</Link></p>
  </AuthFrame>;
}
