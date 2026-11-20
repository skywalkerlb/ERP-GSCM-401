/** Business selection is tab-local; changing it always reloads the application. */
export interface BusinessContext { business_id: string; name: string; slug: string }
function demoMode() { try { return sessionStorage.getItem('glazed-demo-v1') === 'true'; } catch { return false; } }
const mode = demoMode() ? 'demo' : 'real';
const key = mode === 'demo' ? 'glazed-demo-business-v1' : 'glazed-business-v1';
function load(): BusinessContext | null {
  try { const v = JSON.parse(sessionStorage.getItem(key) || 'null'); return v && /^[0-9a-f-]{36}$/i.test(v.business_id) ? v : null; } catch { return null; }
}
let current = load();
export function selectedBusiness() { return current; }
export function selectBusiness(business: BusinessContext | null) {
  try { if (business) sessionStorage.setItem(key, JSON.stringify(business)); else sessionStorage.removeItem(key); } catch { throw new Error('Allow site storage in your browser to select a business, then try again.'); }
  current = business;
}
export function businessStorageKey(key: string) { return `${key}:${mode}:${current?.business_id ?? 'original'}`; }
export function shopPath(path = '') { return `${current?.slug && current.slug !== 'glazed' ? `/b/${encodeURIComponent(current.slug)}/shop` : '/shop'}${path}`; }
