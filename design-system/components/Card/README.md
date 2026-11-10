# Card
A raised, rounded container for a group of related content or a form section.

**Provide:** `children`, optional `title`, `subtitle`, `actions` (ghost/secondary buttons), `padded={false}` for tables.

- `surface-raised` fill, 1px `border`, `radius-lg`, `shadow-sm`. Padding `space-5` (20px).
- Nested elements use smaller radii (`radius-sm`/`radius-md`) than the card.
- Don't nest cards inside cards; use a divider or `surface-sunken` well instead.
- No colored left-border stripes; status goes in a Badge or Alert.
