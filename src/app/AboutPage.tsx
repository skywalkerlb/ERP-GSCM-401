import { isDemo } from '@/lib/supabase';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/Skeleton';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { AppShell } from './AppShell';
import { ThemeToggle } from './ThemeToggle';

const REPO_URL = 'https://github.com/skywalkerlb/ERP-GSCM-401';

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="gz-link" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const LIBRARIES: Array<{ name: string; use: string }> = [
  { name: 'React', use: 'screens and components' },
  { name: 'Vite', use: 'dev server and build' },
  { name: 'TypeScript', use: 'typed code from the database to the screen' },
  { name: 'React Router', use: 'pages and role-based access' },
  { name: 'TanStack Query', use: 'data loading and live refresh' },
  { name: 'Recharts', use: 'charts' },
  { name: 'ZXing', use: 'camera barcode scanning' },
  { name: 'JsBarcode', use: 'printable Code 128 labels' },
  { name: 'Lucide', use: 'icons' },
];

function AboutContent() {
  return (
    <div className="gz-stack gz-stack--lg">
      <PageHeader title="How this system was built" breadcrumb={[{ label: 'Setup' }, { label: 'About this system' }]} subtitle="Glazed is a donut shop ERP built for GSCM 401 with AI coding tools, a hosted Postgres database and its own design system." />

      <div className="gz-grid-stats">
        <StatCard label="AI tools configured" value="5" caption="One shared rulebook" icon="sparkles" tint="pink" />
        <StatCard label="Locations" value="4" caption="Three shops and a central kitchen" icon="store" tint="cocoa" />
        <StatCard label="Items in the catalog" value="35" caption="Ingredients, packaging and donuts" icon="package" tint="mint" />
        <StatCard label="Months of history" value="7" caption="Simulated, then replayed" icon="calendar" tint="lilac" />
      </div>

      <div className="about-grid">
        <Card title="AI coding tools" subtitle="What wrote the plan, the database and the screens.">
          <ul className="about-list">
            <li>
              <strong>Claude Code</strong>
              <Badge tone="accent">Main tool</Badge>
              <span className="gz-muted">Anthropic, model Claude Opus 5.5. Planning, architecture, code and subagents that worked in parallel.</span>
            </li>
            <li>
              <strong>OpenAI Codex</strong>
              <Badge>Configured</Badge>
            </li>
            <li>
              <strong>Cursor</strong>
              <Badge>Configured</Badge>
            </li>
            <li>
              <strong>GitHub Copilot</strong>
              <Badge>Configured</Badge>
            </li>
            <li>
              <strong>Gemini Code Assist</strong>
              <Badge>Configured</Badge>
            </li>
            <li className="gz-muted">All five follow the same project rules: read the docs first, log every change, and keep to the design system.</li>
          </ul>
        </Card>

        <Card title="Services" subtitle="Where the system runs.">
          <ul className="about-list">
            <li>
              <strong>Supabase</strong>
              <span className="gz-muted">Postgres database, sign in (Auth) and live updates (Realtime).</span>
            </li>
            <li>
              <strong>GitHub Pages</strong>
              <span className="gz-muted">Public hosting with HTTPS. Updates publish automatically when main is pushed.</span>
            </li>
            <li>
              <strong>GitHub</strong>
              <span className="gz-muted">Source code at</span>
              <ExtLink href={REPO_URL}>skywalkerlb/ERP-GSCM-401</ExtLink>
            </li>
          </ul>
        </Card>

        <Card title="Key libraries" subtitle="Open source pieces under the hood.">
          <ul className="about-list">
            {LIBRARIES.map((l) => (
              <li key={l.name}>
                <strong>{l.name}</strong>
                <span className="gz-muted">{l.use}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Design system" subtitle="One look across every screen.">
          <ul className="about-list">
            <li>
              <strong>Glazed</strong>
              <span className="gz-muted">Cream and chocolate neutrals, one candy pink, Fredoka for headings, light and dark themes.</span>
            </li>
            <li>
              <span className="gz-muted">Every color, space and size is a design token. A check runs before each commit and rejects hard-coded values.</span>
            </li>
          </ul>
        </Card>

        <Card title="Data" subtitle="Where the numbers come from.">
          <ul className="about-list">
            <li>
              <span className="gz-muted">{isDemo ? 'An AI-generated simulation of seven months of trading, built from a deterministic seed so it can be rerun and match.' : 'Your business records are stored in the permanent business database. Sample data is kept separately in the public demo.'}</span>
            </li>
            <li>
              <span className="gz-muted">{isDemo ? 'History is replayed through the same database functions the screens use, so costs, stock and the books agree to the cent.' : 'Business actions update stock, costs and accounting through transactional database functions. Reports use your stored records.'}</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Frame for people who are not signed in: logo, theme and a way back to sign in. */
function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="about-public">
      <header className="portal-header">
        <Logo to="/" />
        <div className="app-topbar__spacer" />
        <ThemeToggle />
        <Link className="gz-link" to="/login">
          Sign in
        </Link>
      </header>
      <main className="portal-main">{children}</main>
    </div>
  );
}

/** /about: inside the staff shell for staff, in a light public frame for everyone else. */
export function AboutRoute() {
  const { loading } = useAuth();
  const { isStaff } = useRole();
  if (loading) {
    return (
      <div className="portal-main">
        <Skeleton variant="block" />
      </div>
    );
  }
  if (isStaff) {
    return (
      <AppShell>
        <AboutContent />
      </AppShell>
    );
  }
  return (
    <PublicFrame>
      <AboutContent />
    </PublicFrame>
  );
}
