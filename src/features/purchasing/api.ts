import { useQuery } from '@tanstack/react-query';
import { fetchRows, toNumber } from '@/features/items/api';
import { addDays, businessDate, daysBetween } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { views } from '@/lib/rpc';
import type { ApBill, ApPayment, PoLine, PoReceipt, PoReceiptLine, PurchaseOrder } from '@/types/domain';

export interface PoView extends PurchaseOrder {
  lines: PoLine[];
  ordered: number;
  received: number;
  cancelled: number;
  /** Still expected: ordered - received - cancelled. */
  open: number;
  /** A sent order with some stock in and some still to come. */
  partial: boolean;
  /** Past its expected date with stock still to come. */
  late: boolean;
  daysLate: number;
}

export function decoratePo(po: PurchaseOrder, lines: PoLine[], today = businessDate()): PoView {
  const ordered = lines.reduce((s, l) => s + toNumber(l.qty_ordered), 0);
  const received = lines.reduce((s, l) => s + toNumber(l.qty_received), 0);
  const cancelled = lines.reduce((s, l) => s + toNumber(l.qty_cancelled), 0);
  const open = Math.max(0, ordered - received - cancelled);
  const isSent = po.status === 'sent';
  const daysLate = isSent && po.expected_on && open > 0 ? Math.max(0, daysBetween(po.expected_on, today)) : 0;
  return { ...po, lines, ordered, received, cancelled, open, partial: isSent && received > 0 && open > 0, late: daysLate > 0, daysLate };
}

/** The status key to show in a StatusBadge. A partly received order reads "Partially received". */
export function poStatusKey(po: Pick<PoView, 'status' | 'partial'>): { status: string; label?: string } {
  if (po.partial) return { status: 'partially_received' };
  if (po.status === 'sent') return { status: 'sent', label: 'Order sent' };
  return { status: po.status };
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: queryKeys.purchasing.list(),
    queryFn: async (): Promise<PoView[]> => {
      const [pos, lines] = await Promise.all([
        fetchRows<PurchaseOrder>('purchase_orders', { order: [['id', false]] }),
        fetchRows<PoLine>('po_lines', { order: [['id']] }),
      ]);
      const byPo = new Map<number, PoLine[]>();
      for (const l of lines) byPo.set(l.po_id, [...(byPo.get(l.po_id) ?? []), l]);
      const today = businessDate();
      return pos.map((p) => decoratePo(p, byPo.get(p.id) ?? [], today));
    },
  });
}

export interface ReceiptView extends PoReceipt { lines: PoReceiptLine[] }
export interface BillView extends ApBill { payments: ApPayment[] }
export interface PoDetail { po: PoView; receipts: ReceiptView[]; bills: BillView[] }

export function usePurchaseOrder(id: number) {
  return useQuery({
    queryKey: queryKeys.purchasing.detail(id),
    enabled: Number.isFinite(id),
    queryFn: async (): Promise<PoDetail | null> => {
      const pos = await fetchRows<PurchaseOrder>('purchase_orders', { eq: { id } });
      const po = pos[0];
      if (!po) return null;
      const [lines, receipts, bills] = await Promise.all([
        fetchRows<PoLine>('po_lines', { eq: { po_id: id }, order: [['id']] }),
        fetchRows<PoReceipt>('po_receipts', { eq: { po_id: id }, order: [['id']] }),
        fetchRows<ApBill>('ap_bills', { eq: { po_id: id }, order: [['id']] }),
      ]);
      const [receiptLines, payments] = await Promise.all([
        fetchRows<PoReceiptLine>('po_receipt_lines', { in: ['receipt_id', receipts.map((r) => r.id)] }),
        fetchRows<ApPayment>('ap_payments', { in: ['bill_id', bills.map((b) => b.id)], order: [['id']] }),
      ]);
      return {
        po: decoratePo(po, lines),
        receipts: receipts.map((r) => ({ ...r, lines: receiptLines.filter((l) => l.receipt_id === r.id) })),
        bills: bills.map((b) => ({ ...b, payments: payments.filter((p) => p.bill_id === b.id) })),
      };
    },
  });
}

export function useOpenBills(supplierId?: number) {
  return useQuery({
    queryKey: queryKeys.purchasing.scope('open-bills', { supplierId }),
    queryFn: () => views.apOpenBills(supplierId ? { supplier_id: supplierId } : {}),
  });
}

/** Item ids that already sit on a draft purchase order, mapped to the PO number. */
export function useDraftItems() {
  return useQuery({
    queryKey: queryKeys.purchasing.scope('draft-items'),
    queryFn: async (): Promise<Map<number, string>> => {
      const drafts = await fetchRows<Pick<PurchaseOrder, 'id' | 'po_number'>>('purchase_orders', { columns: 'id,po_number', eq: { status: 'draft' } });
      const lines = await fetchRows<Pick<PoLine, 'po_id' | 'item_id'>>('po_lines', { columns: 'po_id,item_id', in: ['po_id', drafts.map((d) => d.id)] });
      const numbers = new Map(drafts.map((d) => [d.id, d.po_number]));
      return new Map(lines.map((l) => [l.item_id, numbers.get(l.po_id) ?? 'a draft']));
    },
  });
}

/** Date an order would arrive if sent today, from the longest lead time of its lines. */
export function estimateExpected(leadDays: number[], from = businessDate()): string | null {
  return leadDays.length ? addDays(from, Math.max(...leadDays)) : null;
}
