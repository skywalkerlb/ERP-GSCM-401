import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Dialog } from '@/components/Dialog';
import { Select } from '@/components/Select';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useSelectedLocation } from '@/hooks/useLocations';
import { rpcErrorMessage } from '@/lib/rpc';
import type { Customer, CustomerKind } from '@/types/domain';
import { useSaveCustomer } from './api';

export interface CustomerDialogProps {
  open: boolean;
  /** The customer being edited, or null to create one. */
  customer: Customer | null;
  onClose: () => void;
  onSaved?: (id: number) => void;
}

const KINDS: Array<{ value: CustomerKind; label: string }> = [
  { value: 'retail', label: 'Retail' },
  { value: 'business', label: 'Business' },
];

export function CustomerDialog({ open, customer, onClose, onSaved }: CustomerDialogProps) {
  const toast = useToast();
  const { shops } = useSelectedLocation();
  const save = useSaveCustomer();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CustomerKind>('retail');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [home, setHome] = useState('');
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? '');
    setKind(customer?.kind ?? 'retail');
    setEmail(customer?.email ?? '');
    setPhone(customer?.phone ?? '');
    setHome(customer?.home_location_id ? String(customer.home_location_id) : '');
    setActive(customer?.is_active ?? true);
    setErrors({});
  }, [open, customer]);

  const kindOptions = customer?.kind === 'walk_in' ? [{ value: 'walk_in', label: 'Walk-in' }, ...KINDS] : KINDS;

  function submit() {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = 'Enter the customer name.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter an email like name@example.com, or leave it empty.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    save.mutate(
      { id: customer?.id ?? null, input: { name, kind, email, phone, home_location_id: home ? Number(home) : null, is_active: active } },
      {
        onSuccess: (id) => {
          toast.success(customer ? 'Customer saved' : 'Customer added', name.trim());
          onSaved?.(id);
          onClose();
        },
        onError: (e) => setErrors({ form: rpcErrorMessage(e) }),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={customer ? 'Edit customer' : 'New customer'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>{customer ? 'Save customer' : 'Add customer'}</Button>
        </>
      }
    >
      <form
        className="gz-form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} className="ins-span-all" />
        <Select label="Kind" value={kind} options={kindOptions} onChange={(e) => setKind(e.target.value as CustomerKind)} />
        <Select label="Home shop" value={home} options={[{ value: '', label: 'No home shop' }, ...shops.map((l) => ({ value: String(l.id), label: l.name }))]} onChange={(e) => setHome(e.target.value)} />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {customer && <Checkbox label="Active customer" checked={active} onChange={(e) => setActive(e.target.checked)} className="ins-span-all" />}
        {errors.form && <div className="gz-field is-error ins-span-all"><div className="gz-field__error">{errors.form}</div></div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
