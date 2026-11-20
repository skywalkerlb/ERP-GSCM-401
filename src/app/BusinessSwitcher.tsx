import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { useQuery } from '@tanstack/react-query';
import { Select } from '@/components/Select';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { selectedBusiness, selectBusiness, type BusinessContext } from '@/lib/businessContext';
import { supabase } from '@/lib/supabase';
import { appPath } from '@/lib/appUrl';
import { homeFor } from '@/hooks/useRole';

export function BusinessSwitcher() {
  const [error, setError] = useState('');
  const { user, profile } = useAuth();
  const query = useQuery({ queryKey: ['business-memberships', user?.id], enabled: Boolean(user), queryFn: async () => {
    const result = await supabase.rpc('list_business_memberships');
    if (result.error) throw result.error;
    return result.data as Array<BusinessContext & { role: AppRole }>;
  } });
  if (!query.data?.length) return null;
  return <><Select label="Business" value={selectedBusiness()?.business_id ?? profile?.business_id ?? ''} options={[...query.data.map(b => ({ value: b.business_id, label: b.name })), { value: 'create', label: 'Create a business' }]} onChange={event => {
    if (event.target.value === 'create') { window.location.assign(appPath('/create-business')); return; }
    const business = query.data.find(b => b.business_id === event.target.value);
    if (!business) return;
    // A fresh document discards old components, pending requests and cached business data.
    try { selectBusiness(business); window.location.assign(appPath(homeFor(business.role))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not switch business. Try again.'); }
  }} />{error && <Alert tone="warning" title="Could not switch business">{error}</Alert>}</>;
}
