import { queryKeys, type QueryDomain } from './queryKeys';

/**
 * Maps an `app_events.topic` prefix (see docs/ARCHITECTURE.md section 4) to the query domains it makes stale.
 * Longest matching prefix wins. `events` (the activity feed) is always refreshed.
 */
const TOPIC_DOMAINS: Array<[prefix: string, domains: QueryDomain[]]> = [
  ['sale.', ['sales', 'inventory', 'finance', 'reports', 'catalog', 'freshness', 'mrp']],
  ['return.', ['returns', 'sales', 'inventory', 'finance', 'reports', 'mrp']],
  ['so.', ['orders', 'inventory', 'mrp', 'catalog', 'sales', 'finance', 'bakeplan']],
  ['po.', ['purchasing', 'inventory', 'suppliers', 'mrp', 'finance']],
  ['mo.', ['production', 'inventory', 'finance', 'bakeplan', 'forecast', 'mrp']],
  ['transfer.', ['transfers', 'inventory', 'mrp']],
  ['inventory.adjusted', ['inventory', 'adjustments', 'finance', 'reports', 'mrp']],
  ['inventory.changed', ['inventory', 'catalog', 'mrp']],
  ['waste.logged', ['freshness', 'inventory', 'finance', 'reports', 'mrp']],
  ['day.closed', ['freshness', 'inventory', 'finance', 'reports', 'mrp']],
  ['bakeplan.released', ['bakeplan', 'forecast', 'production', 'transfers', 'inventory', 'mrp']],
  ['expense.recorded', ['finance', 'reports']],
  ['settings.updated', ['settings', 'purchasing', 'suppliers', 'mrp', 'forecast', 'bakeplan', 'inventory', 'reports', 'finance']],
  ['item.', ['items', 'catalog', 'inventory', 'purchasing', 'mrp']],
  ['customer.', ['customers', 'orders']],
  ['supplier.', ['suppliers', 'purchasing', 'mrp']],
  ['forecast.', ['forecast', 'bakeplan', 'mrp']],
];

/** Query keys to invalidate for an event topic. Unknown topics refresh the activity feed only. */
export function keysForTopic(topic: string): Array<readonly unknown[]> {
  const match = TOPIC_DOMAINS
    .filter(([prefix]) => topic === prefix || topic.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length)[0];
  const domains = new Set<QueryDomain>(match ? match[1] : []);
  domains.add('events');
  return [...domains].map((d) => queryKeys[d].all);
}
