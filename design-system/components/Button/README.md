# Button
Triggers an action; four variants, three sizes, optional leading/trailing icon.

**Provide:** `children` (a short verb label, sentence case: "New order", not "NEW ORDER"), `variant`, `size`, `icon`, `onClick`. Icon-only buttons need `aria-label`.

- `primary` (candy pink fill, chocolate `on-primary` text) — the ONE main action in a view or dialog.
- `secondary` (raised surface + border) — default for everything else (Export, Filter, Edit).
- `ghost` — low-emphasis actions in toolbars, card headers, Cancel.
- `danger` — destructive actions (Delete, Void). Always confirm first.
- `sm` (30px) in tables and dense toolbars; `md` (38px) default; `lg` (46px) for form submit and empty states.
- Radius `radius-md` (`radius-sm` at `sm`). Focus shows a 2px `focus-ring` outline, offset 2px.
- Don't put two primary buttons side by side. Put the primary action on the right of a button group.
