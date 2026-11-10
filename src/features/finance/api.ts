import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { RpcError, reports, rpc, views } from '@/lib/rpc';
import type { DateRange } from '@/features/reports/ReportFilters';
import type { GlAccount, RecordApPaymentParams, RecordExpenseParams } from '@/types/domain';

export function useGlAccounts() {
  return useQuery({
    queryKey: queryKeys.finance.scope('gl-accounts'),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GlAccount[]> => {
      const { data, error } = await supabase.from('gl_accounts').select('*').order('code');
      if (error) throw new RpcError('gl_accounts', error.message, { code: error.code });
      return (data ?? []) as GlAccount[];
    },
  });
}

export function usePnl(range: DateRange, locationId: string, suffix: 'current' | 'previous') {
  const location = locationId ? Number(locationId) : null;
  return useQuery({
    queryKey: queryKeys.finance.scope('pnl', { ...range, location, suffix }),
    queryFn: () => reports.pnl({ ...range, location }),
  });
}

export function useValuationRows() {
  return useQuery({ queryKey: queryKeys.finance.scope('valuation'), queryFn: () => views.inventoryValuation() });
}

export function useGlCheck() {
  return useQuery({ queryKey: queryKeys.finance.scope('gl-check'), queryFn: () => views.inventoryGlCheck() });
}

export function useTurnover(range: DateRange) {
  return useQuery({ queryKey: queryKeys.finance.scope('turnover', { ...range }), queryFn: () => reports.inventoryTurnover(range) });
}

export function useApBills() {
  return useQuery({ queryKey: queryKeys.finance.scope('ap-open'), queryFn: () => views.apOpenBills() });
}

export function useTrialBalance() {
  return useQuery({ queryKey: queryKeys.finance.scope('trial-balance'), queryFn: () => views.trialBalance() });
}

export interface JournalLineRow {
  id: number;
  entry_id: number;
  account_code: string;
  location_id: number | null;
  debit: number;
  credit: number;
  journal_entries: { id: number; entry_date: string; source_type: string; source_id: number | null; memo: string | null; created_at: string };
}

const JOURNAL_SELECT = 'id, entry_id, account_code, location_id, debit, credit, journal_entries!inner(id, entry_date, source_type, source_id, memo, created_at)';

/** Newest journal lines for an account and date range (with the total count, since the list is capped). */
export function useJournalLines(params: { account: string; from: string; to: string; limit?: number }) {
  const limit = params.limit ?? 100;
  return useQuery({
    queryKey: queryKeys.finance.scope('journal-lines', { ...params, limit }),
    queryFn: async (): Promise<{ rows: JournalLineRow[]; total: number }> => {
      let q = supabase.from('journal_lines').select(JOURNAL_SELECT, { count: 'exact' });
      if (params.account) q = q.eq('account_code', params.account);
      q = q.gte('journal_entries.entry_date', params.from).lte('journal_entries.entry_date', params.to);
      const { data, error, count } = await q.order('entry_id', { ascending: false }).order('id', { ascending: true }).limit(limit);
      if (error) throw new RpcError('journal_lines', error.message, { code: error.code });
      return { rows: (data ?? []) as unknown as JournalLineRow[], total: count ?? 0 };
    },
  });
}

/** Every line of one journal entry, to show that debits equal credits. */
export function useJournalEntry(entryId: number | null) {
  return useQuery({
    queryKey: queryKeys.finance.scope('journal-entry', { entryId }),
    enabled: entryId !== null,
    queryFn: async (): Promise<JournalLineRow[]> => {
      const { data, error } = await supabase.from('journal_lines').select(JOURNAL_SELECT).eq('entry_id', entryId!).order('id');
      if (error) throw new RpcError('journal_lines', error.message, { code: error.code });
      return (data ?? []) as unknown as JournalLineRow[];
    },
  });
}

export function useRecordExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: RecordExpenseParams) => rpc.recordExpense(p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.finance.all });
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all });
      void qc.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}

export function usePayBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: RecordApPaymentParams) => rpc.recordApPayment(p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.finance.all });
      void qc.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      void qc.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}
