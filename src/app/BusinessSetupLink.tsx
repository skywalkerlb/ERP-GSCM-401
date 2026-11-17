import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { isDemo } from '@/lib/supabase';
import { onboardingAction, type OnboardingStatus } from '@/lib/onboarding';

export function BusinessSetupLink() {
  const status = useQuery({ queryKey: ['business-setup-status'], queryFn: () => onboardingAction<OnboardingStatus>({ action: 'status' }), enabled: !isDemo, retry: false });
  if (isDemo || !status.data?.available) return null;
  return <p className="auth-foot text-body-sm">Setting up for the first time? <Link className="gz-link" to="/create-business">Create your business</Link>.</p>;
}
