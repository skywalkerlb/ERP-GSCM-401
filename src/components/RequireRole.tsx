import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { homeFor } from '@/hooks/useRole';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { SkeletonLines } from './Skeleton';

export interface RequireRoleProps {
  /** Roles that may see the children. Leave out to allow any signed-in user. */
  roles?: AppRole[];
  /** Where to send people who are not signed in. Defaults to "/login". */
  loginPath?: string;
  /** Shown instead of the default "no access" message. */
  fallback?: ReactNode;
  /** Send people without access to their own home screen instead of showing a message. */
  redirectDenied?: boolean;
  children: ReactNode;
}

/**
 * Guards a screen by role. Signed-out people go to the login page and come back afterwards.
 * `<RequireRole roles={['manager']}>...</RequireRole>`
 */
export function RequireRole({ roles, loginPath = '/login', fallback, redirectDenied, children }: RequireRoleProps) {
  const { session, profile, profileError, loading, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const location = useLocation();

  if (loading) {
    return (
      <div className="gz-guard-loading">
        <SkeletonLines lines={3} />
      </div>
    );
  }
  if (!session) return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  if (!profile) {
    return (
      <EmptyState
        icon="user"
        title="We could not find your profile"
        description={recoveryError || profileError || 'Your account is signed in but its profile is unavailable. Retry, or ask an administrator to finish account setup.'}
        action={<div className="auth-form"><Button variant="primary" disabled={busy} onClick={async () => {
          setBusy(true); setRecoveryError('');
          try { await refreshProfile(); } finally { setBusy(false); }
        }}>{busy ? 'Checking account' : 'Retry account setup'}</Button><Button variant="secondary" disabled={busy} onClick={async () => {
          setBusy(true); setRecoveryError('');
          try { await signOut(); } catch { setRecoveryError('Could not sign out. Check your connection and try again.'); } finally { setBusy(false); }
        }}>Sign out</Button></div>}
      />
    );
  }
  if (roles && !roles.includes(profile.role)) {
    if (redirectDenied || profile.role === 'customer') return <Navigate to={homeFor(profile.role)} replace />;
    return (
      <>
        {fallback ?? (
          <EmptyState
            icon="user"
            title="This screen is for another role"
            description={`Your ${profile.role} account cannot open this page. Ask the platform owner if you need access.`}
            action={
              <Button variant="primary" onClick={() => window.history.back()}>
                Go back
              </Button>
            }
          />
        )}
      </>
    );
  }
  return <>{children}</>;
}
