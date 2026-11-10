import type { ComponentType } from 'react';

/**
 * Code-split a route's page. The page file must `export default` its component:
 *   { path: 'pos', lazy: lazyPage(() => import('./PosPage')) }
 */
export function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  return async () => ({ Component: (await load()).default });
}
