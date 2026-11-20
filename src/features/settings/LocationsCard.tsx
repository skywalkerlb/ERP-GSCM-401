import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Checkbox } from '@/components/Checkbox';
import { DataTable } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { Select } from '@/components/Select';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useLocations, type Location } from '@/hooks/useLocations';
import { queryKeys } from '@/lib/queryKeys';
import { rpcErrorMessage } from '@/lib/rpc';
import { isDemo, supabase } from '@/lib/supabase';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function LocationsCard({ defaultTaxRate }: { defaultTaxRate: number }) {
  const { profile } = useAuth();
  const locations = useLocations();
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  if (isDemo || (profile?.role !== 'owner' && profile?.role !== 'admin')) return null;
  return <>
    <Card title="Locations" subtitle="Create real shops and kitchens, then assign staff in People. Deactivating a location keeps its history." actions={<Button onClick={() => setEditing('new')}>New location</Button>}>
      {locations.isError && <Alert tone="danger" title="Could not load locations">{rpcErrorMessage(locations.error)}</Alert>}
      <DataTable rows={locations.data ?? []} rowKey="id" loading={locations.isLoading} empty="No locations yet. Choose New location to add your first shop." columns={[
        { key: 'name', header: 'Location' }, { key: 'code', header: 'Code', mono: true }, { key: 'kind', header: 'Type' },
        { key: 'status', header: 'Status', render: (l) => l.is_active === false ? 'Inactive' : 'Active' },
        { key: 'edit', header: 'Actions', render: (l) => <Button size="sm" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>Edit</Button> },
      ]} />
    </Card>
    {editing && <LocationForm key={editing === 'new' ? 'new' : editing.id} location={editing === 'new' ? null : editing} defaultTaxRate={defaultTaxRate} onClose={() => setEditing(null)} />}
  </>;
}

function LocationForm({ location, defaultTaxRate, onClose }: { location: Location | null; defaultTaxRate: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: location?.code ?? '', name: location?.name ?? '', kind: location?.kind ?? 'shop', address: location?.address ?? '',
    tax: String(Math.round((location?.tax_rate ?? defaultTaxRate) * 10000) / 100),
    open_time: location?.open_time?.slice(0, 5) ?? '', close_time: location?.close_time?.slice(0, 5) ?? '',
    closed_weekdays: location?.closed_weekdays ?? [], is_active: location?.is_active !== false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_business_location', { p_id: location?.id ?? null, p_location: {
        code: f.code.trim(), name: f.name.trim(), kind: f.kind, address: f.address.trim() || null,
        tax_rate: Math.round(Number(f.tax) * 10000) / 1000000, open_time: f.open_time || null, close_time: f.close_time || null,
        closed_weekdays: f.closed_weekdays, is_active: f.is_active,
      } });
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: queryKeys.locations.all }); onClose(); },
  });
  function submit() {
    const next: Record<string, string> = {};
    if (!f.code.trim() || f.code.trim().length > 40) next.code = 'Enter a location code up to 40 characters.';
    if (!f.name.trim() || f.name.trim().length > 120) next.name = 'Enter a name up to 120 characters.';
    if (!f.address.trim() || f.address.length > 500) next.address = 'Enter an address up to 500 characters.';
    if (f.tax.trim() === '' || !Number.isFinite(Number(f.tax)) || Number(f.tax) < 0 || Number(f.tax) > 30) next.tax = 'Enter a tax rate from 0% to 30%.';
    if (Boolean(f.open_time) !== Boolean(f.close_time) || (f.open_time && f.open_time >= f.close_time)) next.hours = 'Enter both hours, with closing after opening, or leave both blank.';
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }
  const text = (key: 'code' | 'name' | 'address' | 'tax' | 'open_time' | 'close_time') => (e: { target: { value: string } }) => { setF((old) => ({ ...old, [key]: e.target.value })); setErrors((old) => ({ ...old, [key]: '', ...(key === 'open_time' || key === 'close_time' ? { hours: '' } : {}) })); };
  return <Dialog open size="lg" title={location ? `Edit ${location.name}` : 'New location'} onClose={() => { if (!save.isPending) onClose(); }} footer={<><Button onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save location'}</Button></>}>
    <div className="gz-stack">
      <div className="gz-form-grid">
        <TextField label="Code" value={f.code} maxLength={40} onChange={text('code')} error={errors.code} required />
        <TextField label="Name" value={f.name} maxLength={120} onChange={text('name')} error={errors.name} required />
        <Select label="Type" value={f.kind} options={[{ value: 'shop', label: 'Shop' }, { value: 'kitchen', label: 'Kitchen' }]} onChange={(e) => setF((old) => ({ ...old, kind: e.target.value as 'shop' | 'kitchen' }))} />
        <TextField label="Address" required value={f.address} maxLength={500} onChange={text('address')} error={errors.address} />
        <TextField label="Tax rate" type="number" min="0" max="30" step="0.01" suffix="%" value={f.tax} onChange={text('tax')} error={errors.tax} />
        <TextField label="Opening time" type="time" value={f.open_time} onChange={text('open_time')} error={errors.hours} hint="America/Denver local time" />
        <TextField label="Closing time" type="time" value={f.close_time} onChange={text('close_time')} hint="Leave both hours blank for no opening-hours restriction." />
      </div>
      <div role="group" aria-label="Closed days" className="gz-stack gz-stack--sm"><p className="text-body-strong">Closed days</p>
        {WEEKDAYS.map((day, i) => <Checkbox key={day} label={day} checked={f.closed_weekdays.includes(i)} onChange={(e) => setF((old) => ({ ...old, closed_weekdays: e.target.checked ? [...old.closed_weekdays, i].sort() : old.closed_weekdays.filter((d) => d !== i) }))} />)}
      </div>
      <Checkbox label="Active location" checked={f.is_active} onChange={(e) => setF((old) => ({ ...old, is_active: e.target.checked }))} />
      {!f.is_active && <Alert tone="warning" title="This location will be unavailable for new work">Existing records remain. Reassign staff in People if needed.</Alert>}
      {save.isError && <Alert tone="danger" title="Location was not saved">{rpcErrorMessage(save.error)}</Alert>}
    </div>
  </Dialog>;
}
