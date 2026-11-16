/** Username accounts use a reserved non-deliverable Auth identifier, never a contact email. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const USERNAME_DOMAIN = 'users.glazed.invalid';
export function normalizeUsername(value: string): string { return value.trim().toLowerCase(); }
export function usernameEmail(value: string): string { return `${normalizeUsername(value)}@${USERNAME_DOMAIN}`; }
export function usernameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.toLowerCase();
  const suffix = `@${USERNAME_DOMAIN}`;
  if (!normalized.endsWith(suffix)) return null;
  const username = normalized.slice(0, -suffix.length);
  return USERNAME_PATTERN.test(username) ? username : null;
}
