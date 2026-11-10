import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Select, TextField, useToast } from '@/components';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { queryKeys } from '@/lib/queryKeys';
import type { CustomerKind } from '@/types/domain';
import { useCustomerOptions } from './api';
import './shared.css';

export interface CustomerPickerProps {
  value: number | null;
  onChange: (id: number | null) => void;
  label?: string;
  /** Text for the empty choice. Pass null when a customer is required. */
  noneLabel?: string | null;
  error?: string;
}

/** A customer Select with a "New customer" dialog next to it. */
export function CustomerPicker({ value, onChange, label = 'Customer', noneLabel = 'Walk-in, no customer', error }: CustomerPickerProps) {
  const { data, isLoading } = useCustomerOptions();
  const [open, setOpen] = useState(false);
  const options = [
    noneLabel === null ? { value: '', label: isLoading ? 'Loading customers' : 'Choose a customer' } : { value: '', label: noneLabel },
    ...(data ?? []).map((c) => ({ value: String(c.id), label: c.kind === 'business' ? `${c.name} (business)` : c.name })),
  ];
  return (
    <>
      <div className="gz-row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
        <Select
          className="sell-grow"
          label={label}
          options={options}
          value={value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          error={error}
        />
        <Button icon="plus" onClick={() => setOpen(true)} aria-label="New customer" />
      </div>
      <NewCustomerDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => {
          onChange(id);
          setOpen(false);
        }}
      />
    </>
  );
}

function NewCustomerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CustomerKind>('retail');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const create = useMutation({
    mutationFn: () => rpc.createCustomer({ name, kind, email: email || null, phone: phone || null }),
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: queryKeys.customers.all });
      toast.success('Customer added', name);
      setName('');
      setEmail('');
      setPhone('');
      onCreated(id);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New customer"
      description="Add someone so their orders and receipts are linked."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => name.trim() && create.mutate()} disabled={create.isPending || !name.trim()}>
            {create.isPending ? 'Adding' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form className="gz-stack gz-stack--sm" onSubmit={submit} noValidate>
        {create.isError && (
          <Alert tone="danger" title="Could not add the customer">
            {rpcErrorMessage(create.error)}
          </Alert>
        )}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        <Select
          label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value as CustomerKind)}
          options={[
            { value: 'retail', label: 'Retail' },
            { value: 'business', label: 'Business' },
          ]}
        />
        <div className="gz-form-grid">
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
