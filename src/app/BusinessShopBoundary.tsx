import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Alert } from '@/components/Alert';
import { Skeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { selectedBusiness, selectBusiness, type BusinessContext } from '@/lib/businessContext';

/** Resolve the public link before any shop content is mounted. */
export function BusinessShopBoundary({ children, legacy = false }: { children?: ReactNode; legacy?: boolean }) {
  const params = useParams();
  const slug = legacy ? 'glazed' : params.businessSlug!;
  const selected = selectedBusiness();
  const ready = selected?.slug === slug;
  const query = useQuery({ queryKey: ['resolve-business', slug], enabled: !ready, retry: false, queryFn: async () => {
    const result = await supabase.rpc('resolve_business', { p_slug: slug });
    if (result.error) throw result.error;
    const business = (result.data as BusinessContext[])[0];
    if (!business) throw new Error('This business could not be found.');
    selectBusiness(business);
    window.location.reload();
    return business;
  } });
  if (ready) return children ?? <Outlet />;
  if (query.isError) return <div className="auth-page"><Alert tone="warning" title="Shop unavailable">Check the shop link, or <Link className="gz-link" to="/login">return to sign in</Link>.</Alert></div>;
  return <div className="auth-page"><Skeleton variant="block" /></div>;
}

/** Gate initial rendering before AuthProvider can hydrate a previous business profile. */
export function BusinessRouteGate({ children }: { children: ReactNode }) {
  let path = window.location.pathname;
  try { path = decodeURIComponent(path); } catch { /* Resolve malformed links as unavailable without crashing the app. */ }
  const match = path.match(/\/b\/([^/]+)\/shop(?:\/|$)/);
  const isLegacy = /\/shop(?:\/|$)/.test(path) && !match;
  const search = new URLSearchParams(window.location.search);
  const invitedBusinessId = search.get('business_id');
  const recoverySlug = search.get('business');
  const slug = match?.[1] ?? (isLegacy ? 'glazed' : recoverySlug);
  const selected = selectedBusiness();
  const needsResolve = invitedBusinessId ? selected?.business_id !== invitedBusinessId : Boolean(slug && selected?.slug !== slug);
  const query = useQuery({ queryKey: ['initial-business', slug, invitedBusinessId], enabled: needsResolve, retry: false, queryFn: async () => {
    if (invitedBusinessId) await supabase.auth.getSession();
    const result = invitedBusinessId ? await supabase.rpc('list_business_memberships') : await supabase.rpc('resolve_business', { p_slug: slug });
    if (result.error) throw result.error;
    const business = invitedBusinessId ? (result.data as BusinessContext[]).find(b => b.business_id === invitedBusinessId) : (result.data as BusinessContext[])[0];
    if (!business) throw new Error('Unknown business');
    selectBusiness(business);
    window.location.reload();
    return business;
  } });
  if (!needsResolve) return children;
  if (query.isError) return <div className="auth-page"><Alert tone="warning" title="Business unavailable">Check the business link or request a new invitation, then try again.</Alert></div>;
  return <div className="auth-page"><Skeleton variant="block" /></div>;
}
