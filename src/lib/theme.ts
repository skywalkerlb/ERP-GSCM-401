import { useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from './storage';

export type Theme = 'light' | 'dark';
const KEY = 'glazed.theme';
const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  listeners.forEach((l) => l());
}

/** Call once before the first render: restores the saved theme and keeps printouts light. */
export function initTheme(): void {
  const saved = readStorage(KEY);
  apply(saved === 'dark' ? 'dark' : 'light');
  // Printing always uses the light theme so labels and receipts come out dark on white.
  let before: Theme | null = null;
  window.addEventListener('beforeprint', () => {
    before = current();
    if (before !== 'light') apply('light');
  });
  window.addEventListener('afterprint', () => {
    if (before && before !== 'light') apply(before);
    before = null;
  });
}

export function setTheme(theme: Theme): void {
  writeStorage(KEY, theme);
  apply(theme);
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void } {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'light' as Theme,
  );
  return { theme, setTheme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
