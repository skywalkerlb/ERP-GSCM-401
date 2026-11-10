import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export interface Crumb {
  label: string;
  /** Leave out on the current page (the last crumb). */
  to?: string;
}

export interface PageHeaderProps {
  /** Page title, sentence case. */
  title: string;
  /** Breadcrumb trail, for example [{ label: 'Sell' }, { label: 'Point of sale' }]. */
  breadcrumb?: Crumb[];
  /** One line under the title. */
  subtitle?: ReactNode;
  /** Buttons on the right. Include at most one primary Button. */
  actions?: ReactNode;
}

/** Page anatomy: breadcrumb, then the h1 with the primary action on the right. Also sets the browser tab title. */
export function PageHeader({ title, breadcrumb, subtitle, actions }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · Glazed ERP`;
  }, [title]);

  return (
    <header className="gz-page-head">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="gz-crumbs text-body-sm">
          <ol>
            {breadcrumb.map((c, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <li key={`${c.label}-${i}`}>
                  {c.to && !last ? <Link to={c.to}>{c.label}</Link> : <span aria-current={last ? 'page' : undefined}>{c.label}</span>}
                  {!last && <Icon name="chevronRight" size={14} />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="gz-page-head__row">
        <div className="gz-page-head__titles">
          <h1 className="text-h1 gz-page-head__title">{title}</h1>
          {subtitle && <p className="text-body-sm gz-page-head__sub">{subtitle}</p>}
        </div>
        {actions && <div className="gz-page-head__actions">{actions}</div>}
      </div>
    </header>
  );
}
