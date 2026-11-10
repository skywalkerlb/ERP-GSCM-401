# TextField
A labelled single-line input with optional icon, suffix (units, currency), hint and error.

**Provide:** `label` (always — no placeholder-only fields), `value`/`onChange` or `defaultValue`, optional `placeholder`, `hint`, `error`, `icon`, `suffix`, `required`, `disabled`.

- Height `control-md`, radius `radius-sm`, border `border-strong`; focus turns the border `primary` with a soft `pink-100` halo.
- Error: border and message in `danger`, message starts with the alert icon and says how to fix it ("Quantity must be at least 1").
- Right-align numeric entry inside tables; use `suffix` for units rather than writing them in the label.
- Stack fields with `space-4` between them; label-to-field gap is 6px.
