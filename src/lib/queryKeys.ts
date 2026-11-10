/**
 * Query keys for TanStack Query. Every key starts with its domain, so
 * `queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })` refreshes the whole domain.
 *
 *   useQuery({ queryKey: queryKeys.orders.list({ status, locationId }), queryFn })
 *   useQuery({ queryKey: queryKeys.orders.detail(id), queryFn })
 *   useQuery({ queryKey: queryKeys.inventory.scope('grid', { locationId }), queryFn })
 */

type Params = Record<string, unknown> | undefined;

function domain<Root extends string>(root: Root) {
  return {
    /** Prefix of every key in this domain. Use it to invalidate the domain. */
    all: [root] as const,
    list: (params?: Params) => [root, 'list', params ?? {}] as const,
    detail: (id: string | number) => [root, 'detail', id] as const,
    /** Any other named query in this domain, for example `scope('grid', { locationId })`. */
    scope: (name: string, params?: Params) => [root, name, params ?? {}] as const,
  };
}

export const queryKeys = {
  sales: domain('sales'),
  orders: domain('orders'),
  returns: domain('returns'),
  inventory: domain('inventory'),
  items: domain('items'),
  locations: domain('locations'),
  transfers: domain('transfers'),
  adjustments: domain('adjustments'),
  purchasing: domain('purchasing'),
  suppliers: domain('suppliers'),
  mrp: domain('mrp'),
  production: domain('production'),
  forecast: domain('forecast'),
  bakeplan: domain('bakeplan'),
  freshness: domain('freshness'),
  finance: domain('finance'),
  reports: domain('reports'),
  settings: domain('settings'),
  customers: domain('customers'),
  events: domain('events'),
  catalog: domain('catalog'),
  profile: domain('profile'),
} as const;

export type QueryDomain = keyof typeof queryKeys;
