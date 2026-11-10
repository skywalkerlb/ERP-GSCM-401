import type { OrderDiscount, StockCondition } from '@/types/domain';

/** Round to cents the way Postgres `round(x, 2)` does (half away from zero). */
export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + 1e-7)) / 100;
}

/** Parse a number typed into a field. Empty or invalid text becomes 0. */
export function toNumber(text: string | number | null | undefined): number {
  if (typeof text === 'number') return Number.isFinite(text) ? text : 0;
  const n = Number(String(text ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Day-old price = list price less the shop markdown, to the cent (same rule as the database). */
export function unitPriceFor(listPrice: number, condition: StockCondition, markdownPct: number): number {
  return condition === 'day_old' ? round2(listPrice * (1 - markdownPct)) : listPrice;
}

export interface PriceableLine {
  qty: number;
  unitPrice: number;
  discountPct: number;
}

export interface LineAmounts {
  gross: number;
  discount: number;
  net: number;
}

export interface Totals {
  lines: LineAmounts[];
  /** Before discounts. */
  subtotal: number;
  lineDiscount: number;
  orderDiscount: number;
  discountTotal: number;
  /** After discounts, before tax. */
  net: number;
  tax: number;
  total: number;
}

/**
 * A preview of what the database will charge. The receipt always shows the numbers the database returned.
 * Mirrors `_post_sale`: per-line discount, then an order discount on what is left, then tax on the net.
 */
export function computeTotals(lines: PriceableLine[], orderDiscount: OrderDiscount | null, taxRate: number): Totals {
  const amounts = lines.map((l) => {
    const gross = round2(l.qty * l.unitPrice);
    const discount = round2((gross * Math.min(Math.max(l.discountPct, 0), 100)) / 100);
    return { gross, discount, net: round2(gross - discount) };
  });
  const subtotal = round2(amounts.reduce((s, a) => s + a.gross, 0));
  const lineDiscount = round2(amounts.reduce((s, a) => s + a.discount, 0));
  const base = round2(subtotal - lineDiscount);
  let orderDisc = 0;
  if (orderDiscount && orderDiscount.value > 0) {
    orderDisc =
      orderDiscount.type === 'pct'
        ? round2((base * Math.min(orderDiscount.value, 100)) / 100)
        : Math.min(round2(orderDiscount.value), base);
  }
  const discountTotal = round2(lineDiscount + orderDisc);
  const net = round2(subtotal - discountTotal);
  const tax = round2(net * taxRate);
  return { lines: amounts, subtotal, lineDiscount, orderDiscount: orderDisc, discountTotal, net, tax, total: round2(net + tax) };
}

/** Cash amounts a customer is likely to hand over, nearest first, all at least the total. */
export function cashSuggestions(total: number): number[] {
  const out = new Set<number>();
  for (const step of [1, 5, 10, 20, 50, 100]) {
    const v = Math.ceil(total / step) * step;
    if (v >= total && v > 0) out.add(v);
  }
  out.delete(total);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

/** Splits a database message that lists several shortages ("Only 4 X left at Provo. No Y left at Provo.") into lines. */
export function splitMessage(message: string): string[] {
  return message
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean);
}
