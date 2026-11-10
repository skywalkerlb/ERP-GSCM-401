import { useEffect, useRef } from 'react';

export interface BarcodeScannerOptions {
  /** Called with the scanned text (without the Enter). */
  onScan: (code: string) => void;
  /** Shortest code to accept. Defaults to 6. */
  minLength?: number;
  /** Largest gap between keystrokes for them to count as a scanner, in ms. Defaults to 40. */
  maxGapMs?: number;
  /** Turn the listener off, for example while a dialog is open. Defaults to true. */
  enabled?: boolean;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[data-scan-target]')) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Keyboard-wedge barcode scanners type the code very fast and finish with Enter.
 * This hook watches the whole document for keystrokes less than `maxGapMs` apart that end in Enter.
 * Normal typing in fields is ignored unless the field (or a parent) has the `data-scan-target` attribute.
 */
export function useBarcodeScanner({ onScan, minLength = 6, maxGapMs = 40, enabled = true }: BarcodeScannerOptions): void {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        buffer = '';
        return;
      }
      const now = performance.now();
      if (e.key === 'Enter') {
        const code = buffer;
        buffer = '';
        if (code.length >= minLength) {
          e.preventDefault();
          handler.current(code);
        }
        return;
      }
      if (e.key.length !== 1) return; // Shift, Tab, arrows and so on
      if (now - last > maxGapMs) buffer = '';
      buffer += e.key;
      last = now;
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, minLength, maxGapMs]);
}
