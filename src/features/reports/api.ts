import { useQuery } from '@tanstack/react-query';
import { reports, views } from '@/lib/rpc';
import { queryKeys } from '@/lib/queryKeys';
import type { SalesGrain } from '@/types/domain';
import type { DateRange } from './ReportFilters';

/** '' (all locations) -> null, otherwise the numeric id. */
export function locationParam(id: string | undefined): number | null {
  return id ? Number(id) : null;
}

export function useSalesSummary(range: DateRange, grain: SalesGrain, locationId: string) {
  const location = locationParam(locationId);
  return useQuery({
    queryKey: queryKeys.reports.scope('sales-summary', { ...range, grain, location }),
    queryFn: () => reports.salesSummary({ ...range, grain, location }),
  });
}

export function useTopSellers(range: DateRange, locationId: string, by: 'revenue' | 'units', limit: number) {
  const location = locationParam(locationId);
  return useQuery({
    queryKey: queryKeys.reports.scope('top-sellers', { ...range, location, by, limit }),
    queryFn: () => reports.topSellers({ ...range, location, by, limit }),
  });
}

/** Company-wide reorder analysis (stock changes and PO events refresh it through the inventory domain). */
export function useReorderAnalysis() {
  return useQuery({
    queryKey: queryKeys.inventory.scope('reorder-analysis'),
    queryFn: () => views.reorderAnalysis(),
  });
}

export function useItemAvailability() {
  return useQuery({
    queryKey: queryKeys.inventory.scope('report-availability'),
    queryFn: () => views.itemAvailability(),
  });
}

export function useInventoryValuation() {
  return useQuery({
    queryKey: queryKeys.inventory.scope('valuation'),
    queryFn: () => views.inventoryValuation(),
  });
}

export function useSupplierScorecard() {
  return useQuery({
    queryKey: queryKeys.suppliers.scope('scorecard'),
    queryFn: () => views.supplierScorecard(),
  });
}
