/** Vite's base includes the trailing slash for root and repository-hosted builds. */
export const APP_BASE_PATH = import.meta.env.BASE_URL;

/** Full-page navigation needs the hosting prefix; React Router links add it themselves. */
export function appPath(path: string): string {
  return `${APP_BASE_PATH}${path.replace(/^\/+/, '')}`;
}

/** Absolute callback URL for Supabase Auth on the current frontend origin. */
export function appUrl(path: string): string {
  return new URL(appPath(path), window.location.origin).toString();
}
