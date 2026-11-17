// Persistent projects must never be used for public demos or seed mutations.
// Retain the former persistent backend until its data is explicitly retired.
export const PROTECTED_PROJECT_REFS = Object.freeze([
  'wzsbtfzettxpczgulibd',
  'eaphbcbklbcadokfcewc',
]);

export function isProtectedProject(ref) {
  return PROTECTED_PROJECT_REFS.includes(ref);
}

export function assertDisposableDemo(ref, databaseUrl) {
  if (!ref || !/^[a-z]{20}$/.test(ref) || isProtectedProject(ref)) {
    throw new Error('Demo mutations require a separate disposable project. Persistent ERP projects cannot be used.');
  }
  let target;
  try { target = new URL(databaseUrl); }
  catch { throw new Error('Provide a valid disposable demo database connection.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      !(target.hostname === `db.${ref}.supabase.co` ||
        (target.hostname.endsWith('.pooler.supabase.com') && target.username === `postgres.${ref}`))) {
    throw new Error('Demo database connection must match DEMO_PROJECT_REF. No changes performed.');
  }
}
