# StatCard
A KPI tile: label, big number, trend and context, for dashboard headers.

**Provide:** `label`, `value` (pre-formatted string), optional `delta` + `trend` (`up`/`down`/`flat`), `caption` ("vs last month"), `icon` and `tint` (`pink`, `cocoa`, `mint`, `butter`, `lilac`).

- Value uses the `kpi` type style with tabular figures.
- Up is `mint-700`, down is `cherry-600`, and each always shows an arrow — never color alone. If "down" is good for that metric (costs), still show the true direction; explain in the caption.
- Show 3–4 StatCards in a row at the top of a dashboard, `space-4` gap. Vary `tint` across the row.
