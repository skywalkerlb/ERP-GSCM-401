# Glazed Design System

Glazed is the design system for the Glazed donut shop's ERP — the software behind orders, catering, baking batches, inventory, staff and finance. It is warm and sweet without being loud: cream and chocolate neutrals, one candy-pink brand color, and soft pastel partners (mint, butter, lilac) for status. Shapes are round and friendly, like the product. The screens are still work tools used all day, so the data always leads.

## Rules for AI agents (mandatory)

> This section was added when the design system was installed in the project (2026-11-09). It merges the UI rules that came with the design system. The project owner has decided that **every UI/UX change follows this design system unless they explicitly say otherwise for that specific change.** Exceptions are logged in `README.md` §8.1 and marked in code with a `ds-exception:` comment.

**Before touching any UI**
1. Read this file in full. (Hooks block edits until you have read it, along with README.md and PROGRESS.md.)
2. Read `design-system/components/<Name>/README.md` for every component you will use or change.
3. Look at `design-system/reference-light.png` and `reference-dark.png` to see the intended look. The headings in those images use a fallback font; in the real app the brand name, `display`, `h1` and KPI numbers render in Fredoka.

**Hard rules**
- **Tokens only.** Every color, spacing, radius, shadow, font and size comes from `design-system/tokens.css` as `var(--token-name)` (or a Tailwind theme key mapped to that variable). Never write a raw hex, rgb or px value that duplicates a token. If a value you need doesn't exist, stop and ask the user before inventing one. Run `npm run lint:design` to check this rule. Optional Git commit checks are advisory and never block synchronization.
- **Tokens live in one place.** `tokens.json` is the source of truth and `tokens.css` mirrors it. Change a token only when the user asks, update both files together, and never redefine tokens in component files.
- **Use the system's components** (Button, TextField, Select, Checkbox, Badge, Alert, Card, StatCard, DataTable, Tabs, SidebarNav, Icon) with the props in `components/index.d.ts`. Don't create a one-off variant of something the system already has. If a new component is truly needed, build it only from tokens, follow the same patterns (rounded, cream/chocolate, candy pink for the primary action only), and tell the user so it can be added here.
- **Both themes.** Everything must work under `data-theme="light"` and `data-theme="dark"` on `<html>`, with no separately hard-coded dark colors.
- **Status colors are fixed:** success = mint, in progress / info = lilac, warning = butter, danger = cherry, highlight = cocoa, inactive = neutral. Always show a word or icon with the color. Pink never means error.
- **One primary (candy pink) button per view.** Text on `--primary` uses `--on-primary` (chocolate), never white.
- **Accessibility:** text meets 4.5:1 contrast, focus rings are visible (`--focus-ring`, 2px, 2px offset), icon-only buttons have `aria-label`, and form fields always have a visible label.
- **Voice:** sentence case, verb buttons ("Log batch", "Mark ready"), no emoji, no exclamation marks, and error messages that say how to fix the problem.
- **Fonts:** Fredoka for the brand name, `display`, `h1` and KPI numbers; Figtree for everything else; IBM Plex Mono for order numbers and SKUs. Use tabular numbers in tables and KPIs.

**Consistency.** When the user asks to change how something looks (a color, a radius, a component's style), default to changing it **everywhere** by updating the token or shared component, so the whole app changes. If it's unclear whether they meant everywhere or just one spot, ask. Never fork the styling for one screen unless asked. When the user does ask for a one-off, mark the line `ds-exception: <reason>` and log it in README §8.1.

**Before you finish any UI task**, check that you added no hard-coded colors or sizes, that both themes look right, and that the components match their READMEs. List any deviations from the design system in your final message and in the PROGRESS.md changelog entry.

## Principles

- **Sweet, not sugary.** Candy pink is the signature, but most of the screen is cream (`surface`, `surface-raised`) and chocolate text (`ink`). Pink is spent on the main action, the selected item and the brand mark — not on decoration.
- **Round and friendly.** Generous corners (`radius-sm` to `radius-xl`), pill-shaped badges, warm low shadows. No gradients, no glossy effects, no emoji.
- **One look across every module.** Orders, Batches, Inventory, Catering, Staff and Finance use the same components, the same status colors and the same page layout. Change a pattern here once, never per screen.
- **Readable for a full shift.** Every text color meets WCAG AA (4.5:1) on the surfaces its token note names, in light and dark themes — including staff using a tablet near the fryer.

## Using this system (for coding agents)

- Load `tokens.css` (CSS custom properties, fonts and `.text-*` type classes) and `components/components.css`. Every color, space, radius and shadow in app code is a `var(--token-name)` — never a raw hex or px value that duplicates a token.
- Themes: put `data-theme="light"` or `data-theme="dark"` on `<html>`. All tokens switch automatically; don't write separate dark-mode colors in components.
- `components/reference-components.js` is a plain-JS React reference implementation (no build step) and `components/index.d.ts` lists every prop. Re-create them as typed React components with the same props (`components/index.d.ts`) and the same class names and styles from `components/components.css`, or port the CSS to Tailwind by mapping theme values to the CSS variables (for example `colors: { primary: 'var(--primary)' }`, `borderRadius: { lg: 'var(--radius-lg)' }`).
- Fonts are hosted on Google Fonts: **Fredoka** (500, 600) for the brand name, `display`, `h1` and `kpi`; **Figtree** (400, 500, 600, 700) for all other UI; **IBM Plex Mono** (400, 500) for order numbers and SKUs.

## Content and voice

- Warm, plain and quick, like a friendly shift lead: "Batch logged", "Chocolate glaze below reorder point", "Quantity must be at least 1". A little sweetness is welcome in empty states and greetings ("Good morning — 37 catering orders this week"), never in errors.
- Sentence case everywhere — buttons, titles, tabs, menu items ("New catering order", not "New Catering Order"). Only table column headers and nav section titles are uppercase, via the `label` style.
- Buttons are verbs: "Log batch", "Mark ready", "Export". Avoid "OK", "Submit", "Click here".
- Errors say what went wrong and how to fix it, and never blame the user.
- Numbers: thousands separators, currency symbol, two decimals for money (`$342.75`); quantities in the unit the shop uses ("14 dozen", "3 trays"); dates as `Nov 9, 2026`; pickup times as `9:00 AM`.
- No emoji and no exclamation marks in product UI.

## Color

- **Neutrals carry the UI.** `surface` (cream) is the page canvas; `surface-raised` for cards, tables, sidebar and menus; `surface-sunken` for table headers, tab tracks and disabled inputs; `surface-hover` for row and item hover.
- **Text is chocolate.** `ink` for primary text and numbers, `ink-muted` for secondary text and labels, `ink-subtle` only for placeholders and timestamps.
- **Borders:** `border` for decorative hairlines (cards, tables, dividers); `border-strong` for anything interactive (inputs, checkboxes) so it meets 3:1.
- **Candy pink = brand + action.** `primary` (`pink-500`) fills the one main button per view with chocolate `on-primary` text (white fails contrast on this pink, so never use white on it). `pink-50` marks the selected row and active nav item with `pink-800` text; links use `pink-800`.
- **Chocolate = accent.** `accent` (`cocoa-700`) and the cocoa tints are for emphasis, seasonal/special tags and attention counts in navigation.
- **Status pastels:** each status is a soft fill plus deep text of the same hue — success `mint-100`/`mint-800`, info `lilac-100`/`lilac-800`, warning `butter-100`/`butter-800`, danger `cherry-100`/`cherry-800`. Cherry is an orange-red, kept clearly apart from candy pink; never use pink to mean "error". Always pair the color with a word or icon.
- **Charts:** series in this order — `pink-500`, `cocoa-500`, `mint-300`, `butter-300`, `lilac-300`, `pink-300`. Gridlines use `border`; axis text `ink-muted` in `caption`.
- **The 300 shades are decorative** (charts, illustrations, sprinkles). Never use them for text.

## Typography

- Fredoka (rounded) is the brand voice: the logo wordmark, `display`, `h1` and `kpi` numbers. Figtree is the workhorse for everything else. IBM Plex Mono only for identifiers (`mono`: order numbers, SKUs, batch codes).
- Scale: `display` 32 (dashboard greeting), `kpi` 28 (StatCard numbers), `h1` 24 (page titles), `h2` 18 (card titles), `h3` 15 (form groups), `body` 14 (default), `body-sm` 13 (helper, meta), `label` 12 uppercase (table headers), `caption` 12 (badges, axes).
- Weights: 400 regular text, 500 quiet emphasis, 600 titles, buttons and key values.
- All numbers in tables and KPIs use tabular figures (`font-variant-numeric: tabular-nums`) so columns line up.

## Spacing and layout

- 4px base grid: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 20 · `space-6` 24 · `space-8` 32 · `space-10` 40 · `space-12` 48.
- **App shell:** a fixed `SidebarNav` (`sidebar-width` 248px) on the left with the Glazed donut mark; a top bar (`topbar-height` 60px) with location switcher, search and user menu; the content area on `surface` with `space-6` padding and a `content-max` of 1440px.
- **Page anatomy, top to bottom:** breadcrumb (`body-sm`, `ink-muted`) → page title (`h1`) with the primary action on the right → optional Alert → StatCard row (dashboards) → toolbar (Tabs, search, filter/export buttons) → DataTable or Cards → pagination.
- Gaps: `space-4` between fields and between cards in dense grids, `space-6` between cards on dashboards, `space-8` between page sections.
- Forms: two columns on desktop for short fields, one column below 720px; labels above fields.
- Detail pages (an order, a batch): main content in a 2/3 column of Cards, a 1/3 side column for status, totals and activity.
- Touch: screens used on the shop floor (batch logging, order pickup) use `control-lg` buttons and `row-default` rows or larger.

## Shape, borders and elevation

- Radii scale with size: `radius-xs` 6 (checkbox), `radius-sm` 8 (inputs, small buttons), `radius-md` 12 (buttons, alerts, nav items, tab track), `radius-lg` 16 (cards, tables), `radius-xl` 24 (modals, drawers), `radius-full` (badges, pills, avatars). A child always has a smaller radius than its parent.
- Separation comes from 1px `border` first; shadows only lift: `shadow-sm` resting cards and tables, `shadow-md` menus and popovers, `shadow-lg` modals only, over the `overlay` scrim.
- No colored left-border stripes on cards; no gradients.

## States and motion

- Hover: background shifts to `surface-hover` (rows, nav, ghost/secondary buttons) or `primary-hover` (primary).
- Focus: every interactive element shows a solid 2px `focus-ring` outline with a 2px offset (chocolate in light, light pink in dark; 3:1+ on all surfaces). Inputs also glow with a 3px `pink-100` ring.
- Selected: `pink-50` fill (rows, nav items).
- Disabled: 45% opacity for buttons; inputs switch to `surface-sunken` with `ink-muted` text.
- Loading: skeleton blocks in `surface-sunken` with `radius-sm`, matching the content's shape.
- Motion is short and calm: 120–200ms ease on color and background; 200ms ease-out for menus and drawers. No bounces.

## Iconography and brand mark

- Line icons, 24px grid, 1.75 stroke, round caps and joins, inheriting `currentColor`. The `Icon` component ships a starter set in this style; for the full set use Lucide (`lucide-react`) at `strokeWidth={1.75}`.
- Sizes: 16 in small buttons and fields, 18 default (nav, buttons, alerts), 22–24 in empty states.
- Icons sit beside labels, not instead of them — except universally known toolbar actions (search, filter, more), which then need an `aria-label`.
- Brand mark: **the official logo** is "Glazed" in Fredoka 600 beside the donut ring mark (a `primary` ring with a `cocoa-300` outline, as in `SidebarNav`). The project owner approved it on 2026-11-09. Use it wherever the brand appears, and don't swap it for another mark without asking.

## Additions for the ERP build (approved by the project owner, 2026-11-09)

These are part of the design system now. Use them like any other token or component.

- **Layering:** use only `--z-base`, `--z-sticky` (sticky headers), `--z-sidebar` (shell), `--z-dropdown` (menus, popovers), `--z-overlay` (scrim), `--z-modal` (dialogs, drawers), `--z-toast` (notifications). Never use any other z-index number.
- **Motion:** `--duration-fast` 120ms (hover), `--duration-base` 160ms (default), `--duration-slow` 200ms (menus, dialogs entering). Easing is `--ease-standard` for color and `--ease-out` for entering panels.
- **Breakpoints:** `--bp-sm` 720px (one-column forms, phone/scanner layout), `--bp-md` 1024px (sidebar becomes a drawer), `--bp-lg` 1280px (StatCard rows go from 4 to 2). Media queries can't read CSS variables, so write the value and name the token in a comment: `@media (max-width: 720px) /* --bp-sm */`. This is the only allowed raw px in app CSS, and the lint skips lines that contain `--bp-`.
- **Charts:** series colors `--chart-1` to `--chart-6` in that order, `--chart-grid` for gridlines, `--chart-axis` for axis text in the `caption` style. They follow the theme automatically.
- **Dialog** (new component, `gz-dialog`): `--surface-raised` panel, `--radius-xl`, `--shadow-lg`, over an `--overlay` scrim at `--z-overlay`/`--z-modal`. Widths are `--dialog-sm`, `--dialog-md` (default) and `--dialog-lg`, padded `--space-6`. The title is `h2` with a ghost icon-only close button at the top right (`aria-label="Close"`), and actions are right-aligned in the footer, with at most one primary. It traps focus, closes on Esc, returns focus to the trigger, and uses `role="dialog"` with `aria-modal`.
- **ChartCard** (new component): a `Card` with a title, an optional Tabs or Select for the range, and a chart that uses the chart tokens. Every chart also has a text or table equivalent (or a visible total) so meaning doesn't depend on color alone.

## Dark theme

- Same structure, lower glare: deep chocolate surfaces (`surface` `#1c1513`), cream `ink`, and a brighter candy pink so it still pops. Primary buttons keep dark `on-primary` text.
- Pastel status fills become deep, muted tints with light text of the same hue. Never hard-code white text on colored fills — use the `on-…` tokens.
