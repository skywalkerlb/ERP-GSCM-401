import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import type { ReasonCodeRow, ReturnDisposition, ReturnDoc } from '@/types/domain';

export function useReturnReasons() {
  return useQuery({
    queryKey: queryKeys.settings.scope('return-reasons'),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ReasonCodeRow[]> => {
      const { data, error } = await supabase.from('reason_codes').select('code, category, label').eq('category', 'return').order('label');
      if (error) throw new Error(error.message);
      return (data ?? []) as ReasonCodeRow[];
    },
  });
}

export interface RecentReturn extends ReturnDoc {
  locations: { name: string } | null;
  receipt_no: string | null;
  units: number;
}

/** The newest returns and exchanges across the shops. */
export function useRecentReturns() {
  return useQuery({
    queryKey: queryKeys.returns.list({ recent: true }),
    queryFn: async (): Promise<RecentReturn[]> => {
      const { data, error } = await supabase
        .from('returns')
        .select('*, locations(name), return_lines(qty)')
        .order('returned_at', { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<ReturnDoc & { locations: { name: string } | null; return_lines: Array<{ qty: number }> }>;
      const saleIds = [...new Set(rows.map((r) => r.sale_id))];
      const receipts = new Map<number, string>();
      if (saleIds.length > 0) {
        const res = await supabase.from('sales').select('id, receipt_no').in('id', saleIds);
        if (res.error) throw new Error(res.error.message);
        for (const s of (res.data ?? []) as Array<{ id: number; receipt_no: string }>) receipts.set(s.id, s.receipt_no);
      }
      return rows.map((r) => ({
        ...r,
        refund_net: Number(r.refund_net),
        tax_refund: Number(r.tax_refund),
        refund_total: Number(r.refund_total),
        net_due: Number(r.net_due),
        receipt_no: receipts.get(r.sale_id) ?? null,
        units: (r.return_lines ?? []).reduce((s, l) => s + Number(l.qty), 0),
      }));
    },
  });
}

export interface ReturnDetail extends ReturnDoc {
  return_lines: Array<{
    id: number;
    qty: number;
    disposition: ReturnDisposition;
    reason_code: string | null;
    refund_amt: number;
    gross_amt: number;
    cost_amt: number;
    items: { name: string } | null;
  }>;
  exchange: { receipt_no: string } | null;
}

export async function fetchReturn(id: number): Promise<ReturnDetail> {
  const { data, error } = await supabase
    .from('returns')
    .select('*, return_lines(id, qty, disposition, reason_code, refund_amt, gross_amt, cost_amt, items(name))')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  const r = data as unknown as ReturnDetail;
  let exchange: ReturnDetail['exchange'] = null;
  if (r.exchange_sale_id) {
    const res = await supabase.from('sales').select('receipt_no').eq('id', r.exchange_sale_id).maybeSingle();
    exchange = (res.data as { receipt_no: string } | null) ?? null;
  }
  return {
    ...r,
    refund_net: Number(r.refund_net),
    tax_refund: Number(r.tax_refund),
    refund_total: Number(r.refund_total),
    net_due: Number(r.net_due),
    return_lines: (r.return_lines ?? []).map((l) => ({
      ...l,
      qty: Number(l.qty),
      refund_amt: Number(l.refund_amt),
      gross_amt: Number(l.gross_amt),
      cost_amt: Number(l.cost_amt),
    })),
    exchange,
  };
}
