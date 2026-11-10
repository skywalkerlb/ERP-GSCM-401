import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Logo } from '@/components/Logo';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
        </div>
        <EmptyState
          icon="search"
          title="That page is not on the menu"
          description="The link may be old or mistyped. Head back to the start and try again."
          action={
            <Button variant="primary" onClick={() => navigate('/')}>
              Go to the start
            </Button>
          }
        />
      </div>
    </div>
  );
}
