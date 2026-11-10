# DataTable
The core ERP list view: a bordered, rounded table with a sticky uppercase header, hover and selected rows.

**Provide:** `columns` (`key`, `header`, optional `align`, `width`, `mono`, `render`), `rows`, `rowKey`, optional `selectedKeys`, `density` (`default` 48px rows, `compact` 40px), `empty`, `onRowClick`.

- Right-align money and quantities; numbers use tabular figures automatically.
- Mark ID/SKU columns `mono` so they render in IBM Plex Mono, muted.
- Status columns render a Badge. The first meaningful column (name, supplier) is `body-strong`.
- Put filters/search/Tabs above the table in a toolbar row; pagination below, right-aligned.
- Inside a Card use `padded={false}` so the table runs edge to edge.
- Empty state: one sentence plus a primary Button to create the first record.
