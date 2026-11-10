import type { ReactNode } from 'react';
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
  const { session, profile, profileError, loading } = useAuth();
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
        description={profileError ?? "Your account is signed in but has no role yet. Ask the platform owner to set it up, then sign in again."}
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
