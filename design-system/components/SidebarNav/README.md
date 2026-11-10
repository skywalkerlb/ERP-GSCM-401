# SidebarNav
The app's left navigation: brand, grouped sections and items with icons and optional count badges.

**Provide:** `brand`, `sections` (`title`, `items` with `value`, `label`, `icon`, `href`, `badge`), `active`, `onSelect`.

- Width `sidebar-width` (248px), `surface-raised`, right `border`.
- Active item: `pink-50` fill, `pink-800` text, weight 600. Hover: `surface-hover`.
- Group modules under uppercase section titles (Operations, Finance, Admin). Keep it to ~12 items; deeper levels belong in page Tabs.
- Badges (cocoa) are for counts that need action (approvals, exceptions) only.
