import { businessStorageKey } from '@/lib/businessContext';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { readStorage, writeStorage } from '@/lib/storage';
import { useAuth } from './useAuth';

/** A row of the `locations` table. */
export interface Location {
  id: number;
  is_active?: boolean;
  code: string;
  name: string;
  kind: 'shop' | 'kitchen';
  address: string | null;
  size_factor: number | null;
  tax_rate: number | null;
  open_time: string | null;
  close_time: string | null;
  closed_weekdays: number[] | null;
}

/** All locations, for staff. Portal customers get shops from the catalog RPC instead. */
export function useLocations() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: queryKeys.locations.all,
    enabled: Boolean(profile && profile.role !== 'customer'),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Location[]> => {
      const { data, error } = await supabase.from('locations').select('*').order('id');
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });
}

const storageKey = () => businessStorageKey('glazed.location');

export interface LocationContextValue {
  locations: Location[];
  shops: Location[];
  /** The location chosen in the top bar. Null while loading or when no active locations exist. */
  location: Location | null;
  locationId: number | null;
  setLocationId: (id: number) => void;
  loading: boolean;
}

const LocationContext = createContext<LocationContextValue | null>(null);

/** Keeps the selected location in localStorage. Default: the profile's home location, else the first shop. */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { data, isLoading } = useLocations();
  const locations = useMemo(() => (data ?? []).filter((l) => l.is_active !== false), [data]);
  const [selected, setSelected] = useState<number | null>(() => {
    const saved = Number(readStorage(storageKey()));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });

  const shops = useMemo(() => locations.filter((l) => l.kind === 'shop'), [locations]);

  const location = useMemo(() => {
    if (locations.length === 0) return null;
    return (
      locations.find((l) => l.id === selected) ??
      locations.find((l) => l.id === profile?.home_location_id) ??
      shops[0] ??
      locations[0] ??
      null
    );
  }, [locations, shops, selected, profile?.home_location_id]);

  // When the saved choice no longer exists, forget it.
  useEffect(() => {
    if (!isLoading && data && selected !== null && !locations.some((l) => l.id === selected)) {
      setSelected(null);
      writeStorage(storageKey(), null);
    }
  }, [data, isLoading, locations, selected]);

  const setLocationId = useCallback((id: number) => {
    setSelected(id);
    writeStorage(storageKey(), String(id));
  }, []);

  const value = useMemo<LocationContextValue>(
    () => ({ locations, shops, location, locationId: location?.id ?? null, setLocationId, loading: isLoading }),
    [locations, shops, location, setLocationId, isLoading],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/** `const { locationId, location, setLocationId } = useSelectedLocation()` */
export function useSelectedLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useSelectedLocation must be used inside <LocationProvider>.');
  return ctx;
}
