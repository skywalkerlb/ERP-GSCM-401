# Alert
An inline message at the top of a page, card or form explaining a state the user should know about.

**Provide:** `tone`, `title` (one sentence), optional `children` (detail) and `action` (a small secondary Button).

- Tones match Badge: `info` lilac, `success` mint, `warning` butter, `danger` cherry — pastel fill with deep text of the same hue.
- Radius `radius-md`. Don't stack more than two alerts; combine instead.
- Use `danger` only for things that failed; validation errors belong on the field.
