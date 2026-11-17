export const PROTECTED_PROJECT_REFS: readonly string[];
export function isProtectedProject(ref: string): boolean;
export function assertDisposableDemo(ref: string | undefined, databaseUrl: string | undefined): void;
