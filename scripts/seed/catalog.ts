// Master data for the Glazed seed: locations, suppliers, items, BOMs, customers, promotions and events.
// Hidden supplier reliability parameters live here too; the simulator uses them to generate PO history,
// and the database computes scorecards from that history (the parameters themselves are never stored).

import { addDays, nthWeekday, md as mdOf, year as yearOf, inWindow, range as dateRange } from './dates.js';

export type LocCode = 'PRV' | 'ORM' | 'LEH' | 'KIT';
export type ItemType = 'raw' | 'packaging' | 'finished' | 'resale' | 'kit';

export interface LocationDef {
  code: LocCode;
  name: string;
  kind: 'shop' | 'kitchen';
  address: string;
  size_factor: number;
  open_time: string;
  close_time: string;
  closed_weekdays: number[]; // 0 = Sunday
}

export const TAX_RATE = 0.0725;

export const LOCATIONS: LocationDef[] = [
  { code: 'PRV', name: 'Provo shop', kind: 'shop', address: '245 N University Ave, Provo, UT 84601', size_factor: 1.0, open_time: '06:00', close_time: '18:00', closed_weekdays: [0] },
  { code: 'ORM', name: 'Orem shop', kind: 'shop', address: '880 S State St, Orem, UT 84058', size_factor: 0.75, open_time: '06:00', close_time: '18:00', closed_weekdays: [] },
  { code: 'LEH', name: 'Lehi shop', kind: 'shop', address: '1425 W Main St, Lehi, UT 84043', size_factor: 0.6, open_time: '06:00', close_time: '18:00', closed_weekdays: [] },
  { code: 'KIT', name: 'Central Kitchen', kind: 'kitchen', address: '510 N Geneva Rd, Lindon, UT 84042', size_factor: 0, open_time: '02:00', close_time: '14:00', closed_weekdays: [] },
];
export const SHOPS: LocCode[] = ['PRV', 'ORM', 'LEH'];

export type SupCode = 'WAS' | 'INT' | 'CVD' | 'SWP' | 'BHP' | 'BON' | 'HVP';

export interface SupplierDef {
  code: SupCode;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  terms_label: string;
  terms_days: number;
  quoted_lead_time_days: number;
  notes: string;
  // hidden reliability model
  onTime: number; // share of POs whose last receipt lands on or before the expected date
  lateMean: number; // mean days late when late (1 + exponential)
  shortProb: number; // chance a PO ships short on first receipt
  shortMean: number; // average shortfall fraction on a short line
  backorderShare: number; // share of short POs whose remainder arrives later (rest is cancelled at close)
  payLateProb: number; // chance we pay this supplier's bill late
  payLateDays: [number, number];
  expectedRating: 'keep' | 'watch' | 'replace';
}

export const SUPPLIERS: SupplierDef[] = [
  { code: 'WAS', name: 'Wasatch Mill & Grain', contact_name: 'Dale Rasmussen', email: 'orders@wasatchmill.example.com', phone: '801-555-0101', address: '1200 W 300 S, Salt Lake City, UT 84104', terms_label: 'Net 30', terms_days: 30, quoted_lead_time_days: 3, notes: 'Flour and sugar. Delivers Tuesday and Friday.', onTime: 0.95, lateMean: 2.5, shortProb: 0.06, shortMean: 0.2, backorderShare: 0.4, payLateProb: 0.02, payLateDays: [1, 3], expectedRating: 'keep' },
  { code: 'INT', name: 'Intermountain Foodservice', contact_name: 'Marcy Holt', email: 'sales@intermountainfs.example.com', phone: '801-555-0102', address: '4500 S 900 W, Murray, UT 84123', terms_label: 'Net 30', terms_days: 30, quoted_lead_time_days: 5, notes: 'Yeast, oil, spices and glaze base. Frequent short ships on spices.', onTime: 0.78, lateMean: 6, shortProb: 0.4, shortMean: 0.3, backorderShare: 0.1, payLateProb: 0.45, payLateDays: [5, 14], expectedRating: 'watch' },
  { code: 'CVD', name: 'Cache Valley Dairy', contact_name: 'Heidi Nielsen', email: 'dispatch@cachevalleydairy.example.com', phone: '801-555-0103', address: '300 E Center St, Logan, UT 84321', terms_label: 'Net 15', terms_days: 15, quoted_lead_time_days: 2, notes: 'Eggs, milk, butter, chocolate milk. Refrigerated truck.', onTime: 0.96, lateMean: 1.6, shortProb: 0.05, shortMean: 0.2, backorderShare: 0.1, payLateProb: 0.03, payLateDays: [1, 2], expectedRating: 'keep' },
  { code: 'SWP', name: 'Sweet Peak Confections', contact_name: 'Trent Marsh', email: 'accounts@sweetpeak.example.com', phone: '801-555-0104', address: '75 N 400 W, American Fork, UT 84003', terms_label: 'Net 45', terms_days: 45, quoted_lead_time_days: 10, notes: 'Icing, glaze, fillings and pumpkin puree. Slow and often short.', onTime: 0.45, lateMean: 8, shortProb: 0.55, shortMean: 0.32, backorderShare: 0.05, payLateProb: 0.05, payLateDays: [1, 4], expectedRating: 'replace' },
  { code: 'BHP', name: 'Beehive Packaging Co.', contact_name: 'Colleen Barlow', email: 'service@beehivepack.example.com', phone: '801-555-0105', address: '2800 S Redwood Rd, West Valley City, UT 84119', terms_label: 'Net 30', terms_days: 30, quoted_lead_time_days: 14, notes: 'Bags, dozen boxes, cups, lids and gift boxes. Long lead time.', onTime: 0.74, lateMean: 8, shortProb: 0.3, shortMean: 0.3, backorderShare: 0.25, payLateProb: 0.04, payLateDays: [1, 3], expectedRating: 'watch' },
  { code: 'BON', name: 'Bonneville Coffee Roasters', contact_name: 'Jared Whitaker', email: 'wholesale@bonnevillecoffee.example.com', phone: '801-555-0106', address: '690 S 200 E, Salt Lake City, UT 84111', terms_label: 'Net 30', terms_days: 30, quoted_lead_time_days: 7, notes: 'Beans, cold brew and glazed mugs. Roasts to order.', onTime: 0.93, lateMean: 3.5, shortProb: 0.1, shortMean: 0.2, backorderShare: 0, payLateProb: 0.03, payLateDays: [1, 3], expectedRating: 'keep' },
  { code: 'HVP', name: 'Harvest Valley Produce', contact_name: 'Rosa Delgado', email: 'orders@harvestvalley.example.com', phone: '801-555-0107', address: '1850 W 1600 N, Orem, UT 84057', terms_label: 'Net 15', terms_days: 15, quoted_lead_time_days: 3, notes: 'Fresh apples. Seasonal pricing.', onTime: 0.92, lateMean: 3, shortProb: 0.15, shortMean: 0.2, backorderShare: 0, payLateProb: 0.04, payLateDays: [1, 3], expectedRating: 'keep' },
];

export interface ItemDef {
  sku: string;
  name: string;
  category: string;
  type: ItemType;
  uom: 'each' | 'lb' | 'gal';
  cost: number; // purchase cost (purchased items) or rolled-up estimate (made items)
  price?: number;
  leadDays: number;
  shelfLife?: number;
  seasonStart?: string; // MM-DD
  seasonEnd?: string;
  supplier?: SupCode;
  pack?: number;
  barcode: string;
  rop?: number; // filled in by the simulator for the initial stored value
}

let bc = 100100;
const nextBarcode = () => `GZ1${String(bc++).padStart(5, '0')}`;

function mk(sku: string, name: string, category: string, type: ItemType, uom: 'each' | 'lb' | 'gal', cost: number, price: number | undefined, leadDays: number, extra: Partial<ItemDef> = {}): ItemDef {
  return { sku, name, category, type, uom, cost, price, leadDays, barcode: nextBarcode(), ...extra };
}

const donut = (sku: string, name: string, cost: number, price: number, extra: Partial<ItemDef> = {}) =>
  mk(sku, name, 'Donuts', 'finished', 'each', cost, price, 1, { shelfLife: 2, ...extra });

export const ITEMS: ItemDef[] = [
  donut('DN-GLZ', 'Original glazed', 0.29, 1.79),
  donut('DN-CHF', 'Chocolate frosted', 0.33, 1.99),
  donut('DN-MPL', 'Maple bar', 0.42, 2.49),
  donut('DN-RSP', 'Raspberry filled', 0.48, 2.49),
  donut('DN-BCR', 'Boston cream', 0.5, 2.59),
  donut('DN-FRT', 'Apple fritter', 0.62, 3.49),
  donut('DN-PSC', 'Pumpkin spice cake', 0.36, 2.29, { seasonStart: '09-01', seasonEnd: '11-30' }),
  mk('KT-GFT', 'Coffee gift kit', 'Gifts', 'kit', 'each', 12.5, 29.99, 1),
  mk('BV-DRP', 'Drip coffee 16 oz', 'Beverages', 'kit', 'each', 0.45, 2.49, 1),
  mk('BV-CBR', 'Cold brew bottle', 'Beverages', 'resale', 'each', 1.1, 3.99, 7, { supplier: 'BON', pack: 12, shelfLife: 30 }),
  mk('BV-CML', 'Chocolate milk pint', 'Beverages', 'resale', 'each', 0.85, 2.49, 2, { supplier: 'CVD', pack: 12, shelfLife: 14 }),
  mk('RS-BNS', 'House blend beans 12 oz', 'Retail', 'resale', 'each', 6.2, 14.99, 7, { supplier: 'BON', pack: 12 }),
  mk('RS-MUG', 'Glazed mug', 'Retail', 'resale', 'each', 4.5, 12.99, 7, { supplier: 'BON', pack: 12 }),
  mk('RM-FLR', 'Bread flour', 'Ingredients', 'raw', 'lb', 0.42, undefined, 3, { supplier: 'WAS', pack: 50 }),
  mk('RM-SUG', 'Granulated sugar', 'Ingredients', 'raw', 'lb', 0.55, undefined, 3, { supplier: 'WAS', pack: 50 }),
  mk('RM-PSG', 'Powdered sugar', 'Ingredients', 'raw', 'lb', 0.78, undefined, 3, { supplier: 'WAS', pack: 50 }),
  mk('RM-YST', 'Instant yeast', 'Ingredients', 'raw', 'lb', 6.4, undefined, 5, { supplier: 'INT', pack: 10 }),
  mk('RM-OIL', 'Frying oil', 'Ingredients', 'raw', 'lb', 1.15, undefined, 5, { supplier: 'INT', pack: 35 }),
  mk('RM-CIN', 'Cinnamon', 'Ingredients', 'raw', 'lb', 6.5, undefined, 5, { supplier: 'INT', pack: 5 }),
  mk('RM-PSS', 'Pumpkin pie spice', 'Ingredients', 'raw', 'lb', 9.8, undefined, 5, { supplier: 'INT', pack: 5 }),
  mk('RM-VAN', 'Vanilla glaze base', 'Ingredients', 'raw', 'lb', 2.4, undefined, 5, { supplier: 'INT', pack: 25 }),
  mk('RM-EGG', 'Liquid eggs', 'Ingredients', 'raw', 'lb', 2.1, undefined, 2, { supplier: 'CVD', pack: 30, shelfLife: 21 }),
  mk('RM-MLK', 'Whole milk', 'Ingredients', 'raw', 'gal', 3.8, undefined, 2, { supplier: 'CVD', pack: 4, shelfLife: 12 }),
  mk('RM-BTR', 'Butter', 'Ingredients', 'raw', 'lb', 3.6, undefined, 2, { supplier: 'CVD', pack: 36, shelfLife: 60 }),
  mk('RM-CHC', 'Chocolate icing base', 'Ingredients', 'raw', 'lb', 3.2, undefined, 10, { supplier: 'SWP', pack: 25 }),
  mk('RM-MPL', 'Maple glaze base', 'Ingredients', 'raw', 'lb', 3.4, undefined, 10, { supplier: 'SWP', pack: 25 }),
  mk('RM-RSP', 'Raspberry filling', 'Ingredients', 'raw', 'lb', 3.9, undefined, 10, { supplier: 'SWP', pack: 20 }),
  mk('RM-CRM', 'Bavarian cream', 'Ingredients', 'raw', 'lb', 3.5, undefined, 10, { supplier: 'SWP', pack: 20 }),
  mk('RM-PMP', 'Pumpkin puree', 'Ingredients', 'raw', 'lb', 1.6, undefined, 10, { supplier: 'SWP', pack: 30 }),
  mk('RM-APL', 'Diced apples', 'Ingredients', 'raw', 'lb', 1.8, undefined, 3, { supplier: 'HVP', pack: 10, shelfLife: 10 }),
  mk('RM-CBN', 'Bulk coffee beans', 'Ingredients', 'raw', 'lb', 7.5, undefined, 7, { supplier: 'BON', pack: 5 }),
  mk('PK-BAG', 'Donut bag', 'Packaging', 'packaging', 'each', 0.07, undefined, 14, { supplier: 'BHP', pack: 500 }),
  mk('PK-BOX', 'Dozen box', 'Packaging', 'packaging', 'each', 0.42, undefined, 14, { supplier: 'BHP', pack: 100 }),
  mk('PK-CUP', 'Hot cup 16 oz', 'Packaging', 'packaging', 'each', 0.13, undefined, 14, { supplier: 'BHP', pack: 500 }),
  mk('PK-LID', 'Hot cup lid', 'Packaging', 'packaging', 'each', 0.06, undefined, 14, { supplier: 'BHP', pack: 500 }),
  mk('PK-GBX', 'Gift box', 'Packaging', 'packaging', 'each', 1.8, undefined, 14, { supplier: 'BHP', pack: 50 }),
];

export const ITEM_BY_SKU: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.sku, i]));
export const isPurchased = (i: ItemDef) => i.type === 'raw' || i.type === 'packaging' || i.type === 'resale';
export const isSellable = (i: ItemDef) => i.price !== undefined;

// --- Bills of materials (single level), per 1 donut or 1 kit ---
const baseDough = { 'RM-FLR': 0.09, 'RM-SUG': 0.03, 'RM-YST': 0.0025, 'RM-EGG': 0.01, 'RM-MLK': 0.006, 'RM-BTR': 0.008, 'RM-OIL': 0.03 };
const pack = { 'PK-BAG': 0.3, 'PK-BOX': 0.06 };
const scale = (o: Record<string, number>, k: number) => Object.fromEntries(Object.entries(o).map(([s, q]) => [s, +(q * k).toFixed(4)]));

export const BOMS: Record<string, Record<string, number>> = {
  'DN-GLZ': { ...baseDough, 'RM-VAN': 0.04, ...pack },
  'DN-CHF': { ...baseDough, 'RM-VAN': 0.015, 'RM-CHC': 0.035, ...pack },
  'DN-MPL': { ...scale(baseDough, 1.3), 'RM-MPL': 0.045, ...pack },
  'DN-RSP': { ...baseDough, 'RM-RSP': 0.06, 'RM-PSG': 0.025, ...pack },
  'DN-BCR': { ...baseDough, 'RM-CRM': 0.07, 'RM-CHC': 0.03, ...pack },
  'DN-FRT': { 'RM-FLR': 0.14, 'RM-SUG': 0.04, 'RM-YST': 0.003, 'RM-EGG': 0.015, 'RM-MLK': 0.009, 'RM-BTR': 0.012, 'RM-OIL': 0.05, 'RM-APL': 0.12, 'RM-CIN': 0.004, 'RM-VAN': 0.05, ...pack },
  'DN-PSC': { 'RM-FLR': 0.08, 'RM-SUG': 0.045, 'RM-EGG': 0.02, 'RM-MLK': 0.006, 'RM-BTR': 0.01, 'RM-OIL': 0.03, 'RM-PMP': 0.04, 'RM-PSS': 0.004, 'RM-VAN': 0.03, ...pack },
  'KT-GFT': { 'RS-BNS': 1, 'RS-MUG': 1, 'PK-GBX': 1 },
  'BV-DRP': { 'RM-CBN': 0.04, 'PK-CUP': 1, 'PK-LID': 1 },
};
export const DONUT_SKUS = ['DN-GLZ', 'DN-CHF', 'DN-MPL', 'DN-RSP', 'DN-BCR', 'DN-FRT', 'DN-PSC'];
export const KIT_SKUS = ['KT-GFT', 'BV-DRP'];
export const FILLED_SKUS = ['DN-RSP', 'DN-BCR'];

// --- Demand model (units per day at a size-1.0 shop on an average weekday) ---
export type DemandCurve = 'food' | 'drink' | 'retail';
export interface DemandDef {
  base: number;
  curve: DemandCurve;
  wd: number[]; // item-specific weekday multiplier, index 0 = Sunday
  shop?: Partial<Record<LocCode, number>>;
  sellsAtShops: boolean;
}
const WD_CLASSIC = [1.0, 0.98, 0.98, 0.98, 0.99, 1.0, 1.02];
const WD_WEEKEND = [1.1, 0.94, 0.94, 0.95, 0.98, 1.05, 1.12];
const WD_COFFEE = [0.85, 1.12, 1.1, 1.08, 1.05, 0.95, 0.82];
const WD_RETAIL = [1.15, 0.9, 0.9, 0.95, 1.0, 1.15, 1.3];

export const DEMAND: Record<string, DemandDef> = {
  'DN-GLZ': { base: 260, curve: 'food', wd: WD_CLASSIC, shop: { PRV: 1.05 }, sellsAtShops: true },
  'DN-CHF': { base: 150, curve: 'food', wd: WD_CLASSIC, sellsAtShops: true },
  'DN-MPL': { base: 120, curve: 'food', wd: WD_WEEKEND, sellsAtShops: true },
  'DN-RSP': { base: 90, curve: 'food', wd: WD_WEEKEND, shop: { ORM: 1.15 }, sellsAtShops: true },
  'DN-BCR': { base: 80, curve: 'food', wd: WD_WEEKEND, shop: { ORM: 1.1 }, sellsAtShops: true },
  'DN-FRT': { base: 75, curve: 'food', wd: WD_WEEKEND, shop: { LEH: 1.1 }, sellsAtShops: true },
  'DN-PSC': { base: 95, curve: 'food', wd: WD_CLASSIC, sellsAtShops: true },
  'KT-GFT': { base: 0.7, curve: 'retail', wd: WD_RETAIL, sellsAtShops: true },
  'BV-DRP': { base: 125, curve: 'drink', wd: WD_COFFEE, shop: { LEH: 1.25 }, sellsAtShops: true },
  'BV-CBR': { base: 26, curve: 'drink', wd: WD_COFFEE, shop: { PRV: 1.25 }, sellsAtShops: true },
  'BV-CML': { base: 21, curve: 'drink', wd: WD_CLASSIC, shop: { ORM: 1.4 }, sellsAtShops: true },
  'RS-BNS': { base: 6, curve: 'retail', wd: WD_RETAIL, sellsAtShops: true },
  'RS-MUG': { base: 2.6, curve: 'retail', wd: WD_RETAIL, sellsAtShops: true },
};

// Share of daily units by open hour (06:00-17:59), per curve.
export const HOUR_CURVES: Record<DemandCurve, number[]> = {
  food: [0.07, 0.16, 0.17, 0.12, 0.09, 0.07, 0.07, 0.06, 0.06, 0.05, 0.05, 0.03],
  drink: [0.08, 0.15, 0.14, 0.1, 0.08, 0.07, 0.08, 0.08, 0.08, 0.06, 0.05, 0.03],
  retail: [0.03, 0.07, 0.08, 0.09, 0.1, 0.11, 0.11, 0.1, 0.1, 0.08, 0.07, 0.06],
};
// Sunday hours (07:00-13:59 => 7 buckets, same curve start shifted); we reuse the first 7 buckets renormalised.
export const OPEN_HOURS = { weekday: { from: 6, to: 18 }, sunday: { from: 7, to: 14 } };

export const WEEKDAY_INDEX = [0.7, 0.85, 0.8, 0.85, 0.95, 1.25, 1.45]; // Sun..Sat (Sunday applies to Orem and Lehi only)

// --- Customers ---
export interface CustomerDef {
  name: string;
  kind: 'walk_in' | 'retail' | 'business';
  email: string | null;
  phone: string | null;
  home: LocCode | null;
  ordersPerMonth: number; // historical sales-order frequency weight
  dozens: [number, number];
}
export const CUSTOMERS: CustomerDef[] = [
  { name: 'Walk-in customer', kind: 'walk_in', email: null, phone: null, home: null, ordersPerMonth: 0, dozens: [0, 0] },
  { name: 'BYU Student Life Office', kind: 'business', email: 'events@byustudentlife.example.com', phone: '801-555-0111', home: 'PRV', ordersPerMonth: 3.2, dozens: [8, 30] },
  { name: 'Orem Fire Station 2', kind: 'business', email: 'station2@oremfire.example.com', phone: '801-555-0112', home: 'ORM', ordersPerMonth: 1.2, dozens: [3, 6] },
  { name: 'Silicon Slopes Cowork', kind: 'business', email: 'community@siliconslopescowork.example.com', phone: '801-555-0113', home: 'LEH', ordersPerMonth: 2.4, dozens: [5, 18] },
  { name: 'Provo High PTA', kind: 'business', email: 'pta@provohigh.example.com', phone: '801-555-0114', home: 'PRV', ordersPerMonth: 1.0, dozens: [10, 25] },
  { name: 'Timpanogos Dental', kind: 'business', email: 'frontdesk@timpdental.example.com', phone: '801-555-0115', home: 'ORM', ordersPerMonth: 1.6, dozens: [2, 5] },
  { name: 'Utah Valley Realty Group', kind: 'business', email: 'office@uvrealty.example.com', phone: '801-555-0116', home: 'LEH', ordersPerMonth: 1.4, dozens: [3, 8] },
  { name: 'Grace Community Church', kind: 'business', email: 'office@gracecommunity.example.com', phone: '801-555-0117', home: 'ORM', ordersPerMonth: 0.8, dozens: [8, 25] },
  { name: 'Ava Thompson', kind: 'retail', email: 'ava@example.com', phone: '801-555-0121', home: 'PRV', ordersPerMonth: 0.9, dozens: [1, 2] },
  { name: 'Liam Nguyen', kind: 'retail', email: 'liam@example.com', phone: '801-555-0122', home: 'ORM', ordersPerMonth: 0.8, dozens: [1, 2] },
  { name: 'Sofia Martinez', kind: 'retail', email: 'sofia.martinez@example.com', phone: '801-555-0123', home: 'PRV', ordersPerMonth: 0.6, dozens: [1, 3] },
  { name: 'Noah Peterson', kind: 'retail', email: 'noah.peterson@example.com', phone: '801-555-0124', home: 'LEH', ordersPerMonth: 0.5, dozens: [1, 2] },
  { name: 'Emma Jensen', kind: 'retail', email: 'emma.jensen@example.com', phone: '801-555-0125', home: 'ORM', ordersPerMonth: 0.6, dozens: [1, 3] },
  { name: 'Ethan Clark', kind: 'retail', email: 'ethan.clark@example.com', phone: '801-555-0126', home: 'LEH', ordersPerMonth: 0.4, dozens: [1, 2] },
];

export const DEMO_USERS = [
  { email: 'manager@example.com', full_name: 'Morgan Ellis', role: 'manager', home: 'KIT' as LocCode, customer: null },
  { email: 'cashier.provo@example.com', full_name: 'Priya Shah', role: 'cashier', home: 'PRV' as LocCode, customer: null },
  { email: 'cashier.orem@example.com', full_name: 'Owen Brooks', role: 'cashier', home: 'ORM' as LocCode, customer: null },
  { email: 'baker@example.com', full_name: 'Bea Alvarez', role: 'baker', home: 'KIT' as LocCode, customer: null },
  { email: 'ava@example.com', full_name: 'Ava Thompson', role: 'customer', home: null, customer: 'Ava Thompson' },
  { email: 'liam@example.com', full_name: 'Liam Nguyen', role: 'customer', home: null, customer: 'Liam Nguyen' },
];

// --- Business calendar: events that move demand, and promotions that discount it ---

export interface EventDef {
  name: string;
  /** Does the event cover this date? */
  covers: (date: string) => boolean;
  mult: number;
  items: 'donuts' | 'all' | string[];
}

export const thanksgiving = (y: number) => nthWeekday(y, 11, 4, 4);

export const EVENTS: EventDef[] = [
  { name: 'National Donut Day', covers: (d) => d === nthWeekday(yearOf(d), 6, 5, 1), mult: 2.2, items: 'donuts' },
  { name: 'July 3 parade crowds', covers: (d) => mdOf(d) === '07-03', mult: 1.15, items: 'all' },
  { name: 'Independence Day', covers: (d) => mdOf(d) === '07-04', mult: 0.65, items: 'all' },
  { name: 'Pioneer Day', covers: (d) => mdOf(d) === '07-24', mult: 1.35, items: 'donuts' },
  { name: 'Halloween week', covers: (d) => inWindow(mdOf(d), '10-25', '10-31'), mult: 1.1, items: 'all' },
  { name: 'Halloween treats', covers: (d) => inWindow(mdOf(d), '10-27', '10-31'), mult: 1.25, items: ['DN-PSC', 'DN-CHF'] },
  { name: 'Thanksgiving eve', covers: (d) => d === addDays(thanksgiving(yearOf(d)), -1), mult: 1.35, items: 'donuts' },
  { name: 'Thanksgiving Day', covers: (d) => d === thanksgiving(yearOf(d)), mult: 0.45, items: 'all' },
  { name: 'Mother\'s Day gifts', covers: (d) => { const m = addDays(nthWeekday(yearOf(d), 5, 0, 2), 0); return d >= addDays(m, -7) && d <= m; }, mult: 3.5, items: ['KT-GFT', 'RS-MUG'] },
  { name: 'Holiday gifting', covers: (d) => inWindow(mdOf(d), '11-15', '12-24'), mult: 2.5, items: ['KT-GFT', 'RS-MUG', 'RS-BNS'] },
];

export interface PromoDef {
  name: string;
  starts_on: string;
  ends_on: string;
  location: LocCode | null;
  sku: string | null;
  discount_pct: number;
  expected_lift: number;
}

/** Promotions that fall inside [from, to]; these are both inserted as rows and applied by the simulator. */
export function promotionsBetween(from: string, to: string): PromoDef[] {
  const out: PromoDef[] = [];
  for (const d of dateRange(from, to)) {
    const y = yearOf(d);
    if (d === nthWeekday(y, 6, 5, 1)) out.push({ name: 'National Donut Day', starts_on: d, ends_on: d, location: null, sku: null, discount_pct: 10, expected_lift: 2.0 });
    if (mdOf(d) >= '10-01' && mdOf(d) <= '10-31' && new Date(d + 'T00:00:00Z').getUTCDay() === 5) out.push({ name: 'Fritter Friday', starts_on: d, ends_on: d, location: null, sku: 'DN-FRT', discount_pct: 20, expected_lift: 1.5 });
  }
  return out;
}
export function thanksgivingPromo(after: string): PromoDef {
  let y = yearOf(after);
  if (thanksgiving(y) < after) y += 1;
  const t = thanksgiving(y);
  return { name: 'Thanksgiving dozen', starts_on: addDays(t, -3), ends_on: addDays(t, -1), location: null, sku: 'DN-GLZ', discount_pct: 15, expected_lift: 1.35 };
}

// --- Known future orders (offsets are days from "today", the day after the simulation ends) ---
export interface FutureOrder {
  offset: number | 'thanksgiving-3' | 'thanksgiving-2' | 'thanksgiving-1';
  customer: string;
  shop: LocCode;
  channel: 'catering' | 'online' | 'phone' | 'counter';
  hour: number;
  note: string;
  lines: Array<[string, number]>; // sku, dozens
  placedDaysAgo: number;
}
export const FUTURE_ORDERS: FutureOrder[] = [
  { offset: 2, customer: 'Timpanogos Dental', shop: 'ORM', channel: 'phone', hour: 8, note: 'Staff breakfast', lines: [['DN-GLZ', 2], ['DN-CHF', 1], ['DN-RSP', 1]], placedDaysAgo: 3 },
  { offset: 3, customer: 'BYU Student Life Office', shop: 'PRV', channel: 'catering', hour: 7, note: 'Finals-week study break', lines: [['DN-MPL', 60], ['DN-GLZ', 14]], placedDaysAgo: 6 },
  { offset: 4, customer: 'Orem Fire Station 2', shop: 'ORM', channel: 'phone', hour: 7, note: 'Open house for the neighborhood', lines: [['DN-RSP', 25], ['DN-GLZ', 3]], placedDaysAgo: 2 },
  { offset: 5, customer: 'Silicon Slopes Cowork', shop: 'LEH', channel: 'catering', hour: 8, note: 'Member holiday party', lines: [['DN-CHF', 50], ['DN-GLZ', 8]], placedDaysAgo: 5 },
  { offset: 5, customer: 'Grace Community Church', shop: 'ORM', channel: 'catering', hour: 9, note: 'Fall family social', lines: [['DN-BCR', 40], ['DN-GLZ', 6]], placedDaysAgo: 4 },
  { offset: 9, customer: 'Provo High PTA', shop: 'PRV', channel: 'catering', hour: 9, note: 'Teacher appreciation', lines: [['DN-GLZ', 10], ['DN-CHF', 6], ['DN-RSP', 4]], placedDaysAgo: 4 },
  { offset: 12, customer: 'Utah Valley Realty Group', shop: 'LEH', channel: 'catering', hour: 8, note: 'Client appreciation boxes', lines: [['DN-GLZ', 6], ['DN-BCR', 4], ['DN-FRT', 4], ['DN-MPL', 4]], placedDaysAgo: 3 },
  { offset: 'thanksgiving-3', customer: 'BYU Student Life Office', shop: 'PRV', channel: 'catering', hour: 7, note: 'Residence hall Thanksgiving event', lines: [['DN-GLZ', 30], ['DN-MPL', 10], ['DN-CHF', 12], ['DN-BCR', 10]], placedDaysAgo: 4 },
  { offset: 'thanksgiving-3', customer: 'Silicon Slopes Cowork', shop: 'LEH', channel: 'catering', hour: 8, note: 'Holiday party', lines: [['DN-GLZ', 8], ['DN-CHF', 4], ['DN-RSP', 4], ['DN-BCR', 4]], placedDaysAgo: 5 },
  { offset: 'thanksgiving-2', customer: 'Utah Valley Realty Group', shop: 'LEH', channel: 'catering', hour: 9, note: 'Client gifts', lines: [['DN-GLZ', 10], ['DN-BCR', 6], ['DN-CHF', 6], ['DN-PSC', 6]], placedDaysAgo: 6 },
  { offset: 'thanksgiving-2', customer: 'Provo High PTA', shop: 'PRV', channel: 'catering', hour: 8, note: 'Fall assembly', lines: [['DN-GLZ', 16], ['DN-PSC', 10], ['DN-CHF', 8]], placedDaysAgo: 4 },
  { offset: 'thanksgiving-1', customer: 'Timpanogos Dental', shop: 'ORM', channel: 'phone', hour: 8, note: 'Patient gifts', lines: [['DN-PSC', 8], ['DN-GLZ', 4], ['DN-RSP', 3]], placedDaysAgo: 3 },
  { offset: 'thanksgiving-1', customer: 'Orem Fire Station 2', shop: 'ORM', channel: 'phone', hour: 7, note: 'Holiday shift breakfast', lines: [['DN-GLZ', 6], ['DN-BCR', 4], ['DN-MPL', 4], ['DN-PSC', 4]], placedDaysAgo: 2 },
  { offset: 'thanksgiving-1', customer: 'BYU Student Life Office', shop: 'PRV', channel: 'catering', hour: 7, note: 'Thanksgiving dozen pickup', lines: [['DN-PSC', 24], ['DN-GLZ', 20], ['DN-MPL', 8], ['DN-FRT', 8]], placedDaysAgo: 5 },
  { offset: 25, customer: 'Silicon Slopes Cowork', shop: 'LEH', channel: 'catering', hour: 8, note: 'December kickoff', lines: [['DN-GLZ', 8], ['DN-FRT', 4], ['DN-MPL', 4]], placedDaysAgo: 2 },
];
// Two open customer pickup orders, placed through the portal.
export const FUTURE_PICKUPS: Array<{ customer: string; shop: LocCode; offset: number; hour: number; lines: Array<[string, number]> }> = [
  { customer: 'Ava Thompson', shop: 'PRV', offset: 1, hour: 8, lines: [['DN-GLZ', 1], ['DN-CHF', 1]] },
  { customer: 'Liam Nguyen', shop: 'ORM', offset: 2, hour: 9, lines: [['DN-RSP', 1], ['DN-BCR', 1]] },
];

// Holiday gift-kit orders (shares of the total kit count, which the simulator sizes together with the catering orders).
export const FUTURE_GIFT_ORDERS: Array<{ offset: number; customer: string; shop: LocCode; share: number; note: string; hour: number }> = [
  { offset: 4, customer: 'BYU Student Life Office', shop: 'PRV', share: 0.4, note: 'Alumni appreciation gifts', hour: 10 },
  { offset: 10, customer: 'Utah Valley Realty Group', shop: 'LEH', share: 0.2, note: 'Client holiday gifts, boxed and labeled', hour: 9 },
  { offset: 17, customer: 'Silicon Slopes Cowork', shop: 'LEH', share: 0.2, note: 'Member holiday gifts', hour: 10 },
  { offset: 24, customer: 'Grace Community Church', shop: 'ORM', share: 0.2, note: 'Volunteer thank-you gifts', hour: 9 },
];
