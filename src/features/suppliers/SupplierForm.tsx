import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, TextField } from '@/components';
import { MASTER_DOMAINS, saveSupplier, toNumber, useAction } from '@/features/items/api';
import type { Supplier } from '@/types/domain';

interface Props { supplier: Supplier | null; open: boolean; onClose: () => void; onSaved?: (id: number) => void }

/** Create or edit a supplier. Managers only (RLS allows the direct write). */
export function SupplierFormDialog({ supplier, open, onClose, onSaved }: Props) {
  if (!open) return null;
  return <Form key={supplier?.id ?? 'new'} supplier={supplier} onClose={onClose} onSaved={onSaved} />;
}

function Form({ supplier, onClose, onSaved }: Omit<Props, 'open'>) {
  const [f, setF] = useState({
    name: supplier?.name ?? '', code: supplier?.code ?? '', contact_name: supplier?.contact_name ?? '', email: supplier?.email ?? '',
    phone: supplier?.phone ?? '', address: supplier?.address ?? '', terms_label: supplier?.terms_label ?? 'Net 30',
    terms_days: String(supplier?.terms_days ?? 30), quoted_lead_time_days: String(supplier?.quoted_lead_time_days ?? 3),
    notes: supplier?.notes ?? '', is_active: supplier?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  const save = useAction(
    () => saveSupplier(supplier?.id ?? null, {
      name: f.name.trim(), code: f.code.trim().toUpperCase(), contact_name: f.contact_name.trim() || null, email: f.email.trim() || null,
      phone: f.phone.trim() || null, address: f.address.trim() || null, terms_label: f.terms_label.trim() || 'Net 30',
      terms_days: Math.round(toNumber(f.terms_days)), quoted_lead_time_days: Math.round(toNumber(f.quoted_lead_time_days)),
      notes: f.notes.trim() || null, is_active: f.is_active,
    }),
    { invalidate: MASTER_DOMAINS, errorTitle: 'Could not save the supplier', success: supplier ? 'Supplier saved.' : 'Supplier added.', onSuccess: (id) => { onSaved?.(id); onClose(); } },
  );

  function submit() {
    if (!f.name.trim()) return setError('Enter the supplier name.');
    if (!f.code.trim()) return setError('Enter a short supplier code, for example WAS.');
    if (toNumber(f.terms_days, -1) < 0 || toNumber(f.quoted_lead_time_days, -1) < 0) return setError('Terms days and lead time must be 0 or more.');
    setError(null);
    save.mutate(undefined);
  }

  return (
    <Dialog
      open onClose={onClose} size="lg" title={supplier ? `Edit ${supplier.name}` : 'New supplier'}
      footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button variant="primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving' : 'Save supplier'}</Button></>}
    >
      <div className="gz-stack gz-stack--sm">
        <div className="gz-form-grid">
          <TextField label="Name" required value={f.name} onChange={(e) => { const name = e.target.value; setF((c) => ({ ...c, name, code: supplier || c.code ? c.code : name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() })); }} />
          <TextField label="Code" required value={f.code} onChange={set('code')} hint="Three or four capital letters" />
          <TextField label="Contact name" value={f.contact_name} onChange={set('contact_name')} />
          <TextField label="Email" type="email" value={f.email} onChange={set('email')} />
          <TextField label="Phone" type="tel" value={f.phone} onChange={set('phone')} />
          <TextField label="Address" value={f.address} onChange={set('address')} />
          <TextField label="Terms label" value={f.terms_label} onChange={set('terms_label')} hint="Shown on purchase orders, for example Net 30" />
          <TextField label="Terms days" type="number" min={0} step={1} value={f.terms_days} onChange={set('terms_days')} hint="Days after receiving until the bill is due" />
          <TextField label="Quoted lead time" type="number" min={0} step={1} value={f.quoted_lead_time_days} onChange={set('quoted_lead_time_days')} suffix="days" hint="Used for expected dates until real history exists" />
          <TextField label="Notes" value={f.notes} onChange={set('notes')} />
        </div>
        <Checkbox label="Active. Inactive suppliers cannot be chosen on new orders." checked={f.is_active} onChange={(e) => setF((c) => ({ ...c, is_active: e.target.checked }))} />
        {error && <Alert tone="danger" title={error} />}
      </div>
    </Dialog>
  );
}
