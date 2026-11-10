import { Alert } from '@/components/Alert';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from './ThemeToggle';

/** Shown instead of the app until the Supabase environment variables are set. */
export function SetupScreen() {
  return (
    <div className="auth-page">
      <div className="auth-page__theme">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
          <h1 className="text-h1" style={{ margin: 0 }}>
            Connect Glazed to its database
          </h1>
          <p className="gz-muted" style={{ margin: 0 }}>
            The app needs a Supabase project before it can show any data.
          </p>
        </div>
        <Card>
          <div className="gz-stack gz-stack--sm">
            <Alert tone="info" title="Missing connection settings">
              VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set.
            </Alert>
            <ol className="setup-steps">
              <li>
                Copy <span className="gz-mono">.env.example</span> to <span className="gz-mono">.env.local</span> in the project folder.
              </li>
              <li>
                Paste your project URL and anon key from Supabase, under Project settings, then API. Configure the separate demo project to enable the demo role selector.
              </li>
              <li>
                Restart <span className="gz-mono">npm run dev</span> so the new values load.
              </li>
            </ol>
          </div>
        </Card>
      </div>
    </div>
  );
}
