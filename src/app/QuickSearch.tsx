import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';

const CameraScanner = lazy(() => import('@/components/CameraScanner').then((m) => ({ default: m.CameraScanner })));

interface ItemHit {
  id: number;
  sku: string;
  name: string;
  barcode: string | null;
}

async function exactLookup(code: string): Promise<ItemHit | null> {
  const byBarcode = await supabase.from('items').select('id, sku, name, barcode').eq('barcode', code).limit(1);
  const hit = (byBarcode.data as ItemHit[] | null)?.[0];
  if (hit) return hit;
  const bySku = await supabase.from('items').select('id, sku, name, barcode').eq('sku', code.toUpperCase()).limit(1);
  return (bySku.data as ItemHit[] | null)?.[0] ?? null;
}

/** Scan or search dialog: a barcode, SKU or item name opens that item's ledger. Opens with Ctrl+K or Cmd+K. */
export function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [camera, setCamera] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const results = useQuery({
    queryKey: queryKeys.items.scope('search', { q }),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
    refetchInterval: false,
    queryFn: async (): Promise<ItemHit[]> => {
      const pattern = `%${q.replace(/[%_,()]/g, ' ')}%`;
      const { data, error } = await supabase.from('items').select('id, sku, name, barcode').or(`name.ilike.${pattern},sku.ilike.${pattern}`).order('name').limit(8);
      if (error) throw error;
      return (data ?? []) as ItemHit[];
    },
  });

  function go(item: ItemHit) {
    onClose();
    navigate(`/inventory/${item.id}`);
  }

  async function lookup(code: string) {
    const hit = await exactLookup(code.trim());
    if (hit) go(hit);
    else toast.warning('No item matches that code', 'Check the barcode, or search by item name.');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q) return;
    const first = results.data?.[0];
    if (results.data?.length === 1 && first) go(first);
    else void lookup(q);
  }

  return (
    <>
      <Dialog
        open={open && !camera}
        onClose={onClose}
        title="Scan or search"
        description="Scan a barcode, or type a SKU or item name."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button icon="camera" onClick={() => setCamera(true)}>
              Scan with camera
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit}>
          <TextField label="Barcode, SKU or item name" icon="search" value={query} onChange={(e) => setQuery(e.target.value)} data-scan-target autoComplete="off" />
        </form>
        {results.data && results.data.length > 0 && (
          <ul className="app-results">
            {results.data.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => go(it)}>
                  <span className="text-body-strong">{it.name}</span>
                  <span className="gz-mono">{it.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {results.data && results.data.length === 0 && q.length >= 2 && <p className="gz-muted text-body-sm">No items match. Try part of the name or the SKU.</p>}
      </Dialog>
      {camera && (
        <Suspense fallback={null}>
          <CameraScanner
            open
            onClose={() => setCamera(false)}
            onScan={(code) => {
              setCamera(false);
              void lookup(code);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
