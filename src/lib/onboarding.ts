import { isDemo, supabase } from '@/lib/supabase';
export interface OnboardingStatus { available: boolean }
export interface SetupLocation { id: number; name: string }
export interface OnboardingInput {
  action: 'status' | 'locations' | 'complete'; setup_code?: string; business_name?: string;
  location_id?: number | null; location_name?: string; location_address?: string;
}
/** Credentials stay in request bodies and memory, never URLs or browser storage. */
export async function onboardingAction<T>(input: OnboardingInput): Promise<T> {
  if (isDemo) throw new Error('Exit the demo before setting up your business.');
  const { data, error } = await supabase.functions.invoke('onboarding', { body: input });
  if (error) {
    let message = 'Business setup is unavailable. Check your connection or ask the platform owner to finish backend setup.';
    try { const body = await error.context?.json(); if (typeof body?.error === 'string') message = body.error; }
    catch { /* Keep the actionable fallback for connection and configuration errors. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
