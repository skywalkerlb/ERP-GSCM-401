import { useMemo, useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from '@/lib/storage';

export interface CartLine {
  item_id: number;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  /** The shop chosen for pickup. */
  location_id: number | null;
}

const KEY = 'glazed.portal.cart';
const MAX_QTY = 500;

function load(): CartState {
  try {
    const raw = readStorage(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CartState>;
      const lines = (parsed.lines ?? []).filter((l) => Number.isFinite(l.item_id) && l.qty > 0).map((l) => ({ item_id: l.item_id, qty: Math.min(l.qty, MAX_QTY) }));
      return { lines, location_id: parsed.location_id ?? null };
    }
  } catch {
    /* a damaged cart is just an empty cart */
  }
  return { lines: [], location_id: null };
}

let state: CartState = load();
const listeners = new Set<() => void>();

function commit(next: CartState) {
  state = next;
  writeStorage(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const actions = {
  setQty(item_id: number, qty: number) {
    const clamped = Math.min(Math.max(0, Math.floor(qty)), MAX_QTY);
    const rest = state.lines.filter((l) => l.item_id !== item_id);
    const existing = state.lines.find((l) => l.item_id === item_id);
    if (clamped === 0) return commit({ ...state, lines: rest });
    if (existing) return commit({ ...state, lines: state.lines.map((l) => (l.item_id === item_id ? { ...l, qty: clamped } : l)) });
    commit({ ...state, lines: [...rest, { item_id, qty: clamped }] });
  },
  add(item_id: number) {
    const existing = state.lines.find((l) => l.item_id === item_id);
    actions.setQty(item_id, (existing?.qty ?? 0) + 1);
  },
  remove(item_id: number) {
    commit({ ...state, lines: state.lines.filter((l) => l.item_id !== item_id) });
  },
  setLocation(location_id: number | null) {
    commit({ ...state, location_id });
  },
  clear() {
    commit({ lines: [], location_id: state.location_id });
  },
};

/** The pickup cart. It lives in localStorage so it survives a refresh, and every page sees the same cart. */
export function useCart() {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return useMemo(() => ({ ...snapshot, ...actions, count: snapshot.lines.reduce((s, l) => s + l.qty, 0) }), [snapshot]);
}
