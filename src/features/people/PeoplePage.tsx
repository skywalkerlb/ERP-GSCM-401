import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { TextField } from '@/components/TextField';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { isDemo, supabase } from '@/lib/supabase';
import { usernameFromEmail, USERNAME_DOMAIN } from '../../../supabase/functions/_shared/identity';
import { assignableRoles, canManageAccount, canAssignAccountRole, type AccountRole } from '../../../supabase/functions/_shared/account-access';

interface Person {
  user_id: string;
  email: string;
  username?: string | null;
  full_name: string | null;
  role: AppRole;
  home_location_id: number | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
  status?: 'active' | 'invited' | 'unconfirmed';
}
type Actor = Pick<Person, 'user_id' | 'role'>;
interface Directory {
  people: Person[];
  locations: { id: number; name: string }[];
}
interface PeopleAction {
  action: 'list' | 'invite' | 'resend' | 'set-role';
  email?: string;
  userId?: string;
  role?: string;
  homeLocationId?: number | null;
}
const DEMO_KEY = 'glazed-demo-people-v1';
const QUERY_KEY = ['people-directory', isDemo];
function accountName(person: Person): string { return person.username || usernameFromEmail(person.email) || person.email; }

function sampleDirectory(): Directory {
  const roles = ['owner', 'admin', 'manager', 'cashier', 'baker', 'customer'] as AppRole[];
  return {
    people: roles.map((role) => ({ user_id: `demo-${role}`, email: `${role}@example.com`, username: role === 'customer' ? 'demo_customer' : null, full_name: `Demo ${role}`, role, home_location_id: role === 'customer' ? null : 1, invited_at: null, email_confirmed_at: '2026-11-10T00:00:00Z' })),
    locations: [{ id: 1, name: 'Provo' }, { id: 2, name: 'Orem' }, { id: 3, name: 'Lehi' }, { id: 4, name: 'Central Kitchen' }],
  };
}

function demoAction(input: PeopleAction, actor: Actor): Directory & { message?: string } {
  let directory = sampleDirectory();
  const saved = sessionStorage.getItem(DEMO_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Directory;
      if (Array.isArray(parsed.people) && Array.isArray(parsed.locations)) directory = parsed;
    } catch { /* An old demo session starts again with the sample directory. */ }
  }
  if (!assignableRoles(actor.role).length) throw new Error('Staff management access is required.');
  if (!['list', 'invite', 'resend', 'set-role'].includes(input.action)) throw new Error('Unsupported business account action. Password recovery belongs to the account holder.');
  if (input.action === 'list') return directory;
  if (input.action === 'invite') {
    const email = input.email!.trim().toLowerCase();
    if (email.endsWith(`@${USERNAME_DOMAIN}`)) throw new Error('Username accounts do not use invitation emails. Edit their access in the directory.');
    const existing = directory.people.find((person) => person.email.toLowerCase() === email);
    if (!canAssignAccountRole(actor.role, existing?.role ?? 'customer', input.role as AccountRole, actor.user_id, existing?.user_id)) throw new Error('You cannot assign this account or role.');
    if (existing) {
      existing.role = input.role as AppRole;
      existing.home_location_id = input.homeLocationId ?? null;
    } else {
      directory.people.push({ user_id: crypto.randomUUID(), email, full_name: null, role: input.role as AppRole, home_location_id: input.homeLocationId ?? null, invited_at: new Date().toISOString(), email_confirmed_at: null });
    }
  } else {
    const person = directory.people.find((item) => item.user_id === input.userId);
    if (!person || !canManageAccount(actor.role, person.role, actor.user_id, person.user_id)) throw new Error('You cannot manage this account.');
    if (input.action === 'set-role' && !canAssignAccountRole(actor.role, person.role, input.role as AccountRole, actor.user_id, person.user_id)) throw new Error('Choose a role you can assign.');
    if (input.action === 'set-role') {
      person.role = input.role as AppRole;
      person.home_location_id = input.homeLocationId ?? null;
    } else person.invited_at = new Date().toISOString();
  }
  sessionStorage.setItem(DEMO_KEY, JSON.stringify(directory));
  return { ...directory, message: 'Demo change saved in this tab. No email was sent and no passwords or account permissions were changed.' };
}

async function peopleAction(input: PeopleAction, actor: Actor): Promise<Directory & { message?: string }> {
  if (isDemo) return demoAction(input, actor);
  const { data, error } = await supabase.functions.invoke('people', { body: {
    action: input.action, email: input.email, user_id: input.userId,
    role: input.role, home_location_id: input.homeLocationId,
  } });
  if (error) {
    let message = 'Could not manage people. Check your connection and try again.';
    try {
      const body = await error.context?.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch { /* Keep the actionable fallback if the server response is not JSON. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  if (input.action === 'list') {
    const locations = await supabase.from('locations').select('id, name').order('name');
    if (locations.error) throw new Error('Could not load locations. Refresh the directory and try again.');
    return { people: data.users, locations: locations.data };
  }
  return data;
}

export default function PeoplePage() {
  const routeLocation = useLocation();
  const { profile } = useAuth();
  const allowedRoles = assignableRoles(profile?.role ?? 'customer');
  const canManage = allowedRoles.length > 0;
  const actor: Actor = { role: profile?.role ?? 'customer', user_id: isDemo ? `demo-${profile?.role}` : profile?.user_id ?? '' };
  const options = allowedRoles.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));
  const staffOptions = options.filter((option) => option.value !== 'customer');
  const queryKey = [...QUERY_KEY, profile?.user_id, profile?.role];
  const queryClient = useQueryClient();
  const directory = useQuery({ queryKey, queryFn: () => peopleAction({ action: 'list' }, actor), enabled: canManage });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(staffOptions[0]?.value ?? 'cashier');
  const [location, setLocation] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [editRole, setEditRole] = useState<string>(staffOptions[0]?.value ?? 'cashier');
  const [editLocation, setEditLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setRole(assignableRoles(profile?.role ?? 'customer').find((value) => value !== 'customer') ?? 'cashier');
    setEditing(null);
  }, [profile?.role, profile?.user_id]);

  async function mutate(input: PeopleAction) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await peopleAction(input, actor);
      setNotice(result.message ?? 'Access updated.');
      setEditing(null);
          if (input.action === 'invite') setEmail('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save access. Try again.');
    } finally {
      // Invitations may create an account even if assigning access fails.
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setBusy(false);
    }
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({ action: 'invite', email: email.trim(), role, homeLocationId: location ? Number(location) : null });
  }

  const locationOptions = [{ value: '', label: 'No home location' }, ...(directory.data?.locations ?? []).map((item) => ({ value: String(item.id), label: item.name }))];
  const columns: DataTableColumn<Person>[] = [
    { key: 'email', header: 'Person', render: (person) => <><strong>{person.full_name || accountName(person)}</strong>{person.full_name && <div className="gz-muted text-body-sm">{accountName(person)}</div>}</> },
    { key: 'role', header: 'Role', render: (person) => person.role.charAt(0).toUpperCase() + person.role.slice(1) },
    { key: 'home_location_id', header: 'Home location', render: (person) => directory.data?.locations.find((item) => item.id === person.home_location_id)?.name ?? 'None' },
    { key: 'status', header: 'Status', render: (person) => {
      const status = person.status ?? (person.email_confirmed_at ? 'active' : person.invited_at ? 'invited' : 'unconfirmed');
      return <Badge tone={status === 'active' ? 'success' : 'info'}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
    } },
    { key: 'actions', header: 'Actions', render: (person) => !canManageAccount(actor.role, person.role, actor.user_id, person.user_id) ? <span className="gz-muted">Access is protected</span> : <div className="gz-row"><Button size="sm" disabled={busy} aria-label={`Edit access for ${accountName(person)}`} onClick={() => { setEditing(person); setEditRole(person.role); setEditLocation(person.home_location_id === null ? '' : String(person.home_location_id)); }}>Edit access</Button>{(person.status === 'invited' || (person.invited_at && !person.email_confirmed_at)) && <Button size="sm" disabled={busy} aria-label={`Resend invitation to ${accountName(person)}`} onClick={() => void mutate({ action: 'resend', userId: person.user_id })}>Resend invitation</Button>}</div> },
  ];

  if (!canManage) return <Alert tone="warning" title="Staff management access required">Ask an owner, admin or manager to manage invitations and staff roles.</Alert>;

  return <>
    <PageHeader title="People" breadcrumb={[{ label: 'Setup' }, { label: 'People' }]} subtitle="Invite people by email and manage accounts below your own level. New staff choose their own password from their invitation email." />
    <div className="gz-stack">
      {(routeLocation.state as { businessCreated?: boolean } | null)?.businessCreated && <Alert tone="success" title="Your business is ready">Invite your admins and staff below. Their email will be their username.</Alert>}
      {isDemo && <Alert tone="info" title="Simulated access management">Try invitations and role changes using sample people. Changes stay in this browser tab; no emails are sent and no real or demo passwords or account permissions change.</Alert>}
      {error && <Alert tone="danger" title="Access was not saved">{error}</Alert>}
      {notice && <Alert tone="success" title="Access updated">{notice}</Alert>}
      {directory.isError && <Alert tone="danger" title="Could not load people" action={<Button onClick={() => void directory.refetch()}>Try again</Button>}>{directory.error instanceof Error ? directory.error.message : 'Try loading the directory again.'}</Alert>}
      <Card title="Invite a person" subtitle="New staff receive an email to set their password. Existing customers keep their account and customer records.">
        <form className="gz-stack" onSubmit={invite}>
          <div className="gz-form-grid">
            <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
            <Select label="Staff role" options={staffOptions} value={role} onChange={(event) => setRole(event.target.value)} disabled={busy} />
            <Select label="Home location" options={locationOptions} value={location} onChange={(event) => setLocation(event.target.value)} disabled={busy || directory.isPending} />
          </div>
          <div><Button type="submit" variant="primary" disabled={busy || !email.trim() || !directory.data}>{busy ? 'Saving' : 'Invite person'}</Button></div>
        </form>
      </Card>
      {editing && <Card title={`Edit access for ${accountName(editing)}`}>
        <form className="gz-stack" onSubmit={(event) => { event.preventDefault(); void mutate({ action: 'set-role', userId: editing.user_id, role: editRole, homeLocationId: editRole === 'customer' ? null : editLocation ? Number(editLocation) : null }); }}>
          <div className="gz-form-grid">
            <Select label="Role" options={options} value={editRole} onChange={(event) => setEditRole(event.target.value)} disabled={busy} />
            <Select label="Home location" options={locationOptions} value={editLocation} onChange={(event) => setEditLocation(event.target.value)} disabled={busy || editRole === 'customer'} />
          </div>
          <div className="gz-row"><Button type="submit" disabled={busy}>Save access</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div>
        </form>
      </Card>}
      <p className="gz-muted text-body-sm">Password recovery is managed by the account holder from sign in. Username-only accounts require trusted platform support.</p>
      <Card title="Business accounts" padded={false} actions={<Button variant="ghost" disabled={busy || directory.isFetching} onClick={() => void directory.refetch()}>Refresh people</Button>}>
        <DataTable columns={columns} rows={directory.data?.people ?? []} rowKey="user_id" loading={directory.isPending} empty="No accounts found. Invite a person above to get started." aria-label="Business accounts and access" />
      </Card>
    </div>
  </>;
}
