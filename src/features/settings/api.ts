import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { RpcError, views } from '@/lib/rpc';
import type { AppSettings, PeriodicReviewRow, ReorderAnalysisRow, SupplierScorecardRow } from '@/types/domain';

export function useAppSettings() {
  return useQuery({
    queryKey: queryKeys.settings.detail('app'),
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).single();
      if (error) throw new RpcError('app_settings', error.message, { code: error.code });
      return data as AppSettings;
    },
  });
}

/** The editable columns of app_settings (fractions stay fractions here; the form shows percentages). */
export type SettingsPatch = Partial<Omit<AppSettings, 'id' | 'timezone' | 'updated_at'>>;

export interface PlanningSnapshot {
  reorder: ReorderAnalysisRow[];
  scorecard: SupplierScorecardRow[];
  review: PeriodicReviewRow[];
}

/** The numbers that settings drive: EOQ and ROP, the periodic review levels and the supplier scores. */
export async function planningSnapshot(): Promise<PlanningSnapshot> {
  const [reorder, scorecard, review] = await Promise.all([views.reorderAnalysis(), views.supplierScorecard(), views.periodicReview()]);
  return { reorder, scorecard, review };
}

export interface SaveSettingsInput {
  patch: SettingsPatch;
  locationTax: Array<{ id: number; tax_rate: number }>;
}

export interface SaveSettingsResult {
  before: PlanningSnapshot;
  after: PlanningSnapshot;
}

/**
 * Saves app_settings (a direct manager update under RLS; the database trigger writes the `settings.updated` event)
 * and any changed location tax rates. Reads the planning numbers before and after so the page can show what moved.
 */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ patch, locationTax }: SaveSettingsInput): Promise<SaveSettingsResult> => {
      const before = await planningSnapshot();
      if (Object.keys(patch).length > 0) {
        const { data, error } = await supabase.from('app_settings').update(patch).eq('id', 1).select();
        if (error) throw new RpcError('app_settings', error.message, { code: error.code });
        if (!data || data.length === 0) throw new Error('Settings were not saved. Only managers can change them, so sign in as a manager and try again.');
      }
      for (const loc of locationTax) {
        const { data, error } = await supabase.from('locations').update({ tax_rate: loc.tax_rate }).eq('id', loc.id).select();
        if (error) throw new RpcError('locations', error.message, { code: error.code });
        if (!data || data.length === 0) throw new Error('A location tax rate was not saved. Only managers can change it.');
      }
      const after = await planningSnapshot();
      return { before, after };
    },
    onSuccess: () => {
      // The settings.updated event does this too for everyone else; invalidate here so this screen is instant.
      for (const key of [
        queryKeys.settings.all, queryKeys.locations.all, queryKeys.purchasing.all, queryKeys.suppliers.all, queryKeys.mrp.all,
        queryKeys.forecast.all, queryKeys.bakeplan.all, queryKeys.inventory.all, queryKeys.reports.all, queryKeys.finance.all,
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
