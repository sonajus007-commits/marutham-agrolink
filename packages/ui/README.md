# @marutham/ui

The only place reusable UI lives. Styled with Tailwind utilities that resolve
through `@marutham/tokens` — never a hard-coded colour, never a page-local
component.

## Running shadcn's CLI

`components.json` is configured, so `pnpm dlx shadcn@latest add dialog` will
drop a component into `src/`. **Read what it generates before you keep it.**

shadcn's components are written against its own colour vocabulary —
`bg-background`, `text-muted-foreground`, `border-input`, `ring-ring`. Those
theme keys do not exist here, and most of them should not: this design system
already names the same ideas.

| shadcn | here |
|---|---|
| `background` / `foreground` | `bg` / `fg` |
| `muted` / `muted-foreground` | `surface-muted` / `fg-muted` |
| `card`, `popover` | `surface`, `surface-raised` |
| `border` | `border-subtle` |
| `input` | `border-strong` |
| `ring` | `leaf` |
| `destructive` | `danger` |
| `primary-foreground` | `primary-on` |

One of them is a genuine collision rather than a rename. **shadcn's `accent`
means "the subtle background a row takes on hover."** Ours means the Marutham
blossom — the signature brand accent. They are not the same idea and they must
not share a token name. When porting a shadcn component, its `bg-accent` becomes
`bg-surface-muted`, and `bg-accent` keeps meaning bloom.

So: take shadcn's structure, its Radix wiring and its accessibility work.
Retranslate its classes. That is what "you own the code" buys.

## Preflight

Not enabled yet. Tailwind's reset would repaint every screen still styled by
`ui.css` and the three page stylesheets. Components therefore reset themselves
where it matters — `Button` carries `appearance-none border-0 font-sans`.

Turn preflight on once `ui.css` is empty, and strip those three classes.

## Guards

- `pnpm ui:classes` (CI, after build) — every Tailwind class used here must
  produce CSS. Tailwind silently emits nothing for a class whose theme key does
  not exist, so a typo animates nothing and fails no test.
- `pnpm tokens:literals` (CI) — no hard-coded colours. Hex everywhere; **and
  `rgba()`/`hsla()` inside `packages/`**, where a bare alpha colour must instead
  be a token or a `color-mix()` derived from one. `apps/web`'s page stylesheets
  still hold 24 of them and are exempt until Phase 4 rewrites those screens.
- `pnpm tokens:contrast` (CI) — every semantic pair clears WCAG.

## Dialogs

`Sheet` and `Modal` are Radix Dialog. Radix supplies the focus trap, the
`inert` background, Escape, and — importantly — keeps nesting honest: a `Modal`
opened from inside a `Sheet` takes the top of the dismissable-layer stack, so
Escape closes the `Modal` and leaves the `Sheet` standing.

Two things Radix does **not** do for us, both found by driving a real browser:

- **Scroll lock lives in `Dialog.Overlay`, not `Dialog.Content`.** `Sheet` renders
  an invisible Overlay purely for this. Delete it and the page scrolls behind a
  full-screen sheet.
- **Focus is returned to `Dialog.Trigger`.** Every dialog here is controlled by an
  `open` prop, so there is no Trigger, and Radix hands focus to `<body>`.
  `lib/useReturnFocus.ts` captures the real trigger and both dialogs restore it
  via `onCloseAutoFocus`.

`Modal`'s `dismissible={false}` closes all three exits — no ✕, and Escape and
outside-pointer events are cancelled. It is the suspended seller's subscription
gate; there is no way out but the action it asks for.

## Table

The one component here with enough logic to be worth testing. All of it —
sorting, filtering, pagination, selection, CSV — lives in `@marutham/lib/table`,
pure and DOM-free, so `pnpm test` covers it without a renderer and a React
Native table can reuse it. `Table.tsx` is markup, ARIA and state.

Four decisions that look arbitrary and are not:

- **`border-separate`, not `border-collapse`.** Under `collapse` the borders
  belong to the table, not the cell, and Chrome scrolls a sticky header's bottom
  border away from it. The sticky header only sticks against a bounded scroller,
  so it needs `maxHeight` to do anything.
- **Empty cells sort last in both directions.** Reversing a sort surfaces the
  largest values; it should not promote the rows missing the value entirely.
- **Strings compare under numeric collation.** The API returns Postgres
  `numeric` as a string, so one column holds `1200.50` and `900` — a plain
  codepoint sort puts `1200.50` first.
- **CSV export escapes formula leads** (`=`, `+`, `-`, `@`) and ships a BOM.
  Cells carry user-typed names, and `=cmd|' /C calc'!A0` is a live formula the
  moment Excel opens the file. Without the BOM, Excel reads the file in the
  local ANSI codepage and mangles every Tamil name in it.

Select-all governs the current page only, and a selection survives paging away
and back. Export sends the filtered, sorted rows — or just the selected ones,
when there is a selection.

Its pager and search box are now the standalone `Pagination` and `SearchInput`;
`Table` renders them, it does not reimplement them.

## Pagination, SearchInput

Extracted from `Table` once a second caller wanted them on their own. `Table`
still renders both — there is one pager and one search box in the codebase, not
two.

`Pagination` is controlled: the caller owns the page, and the "X–Y of Z" range
plus prev/next are drawn from `pageCount`/`clampPage` in `@marutham/lib/table`.
It clamps the incoming `page`, so a stale page after the dataset shrinks lands on
the last real page, never an empty one, and it renders nothing when there is a
single page or no rows.

`SearchInput` is a controlled `type="search"` box with a magnifier — logic-free,
holding no query and doing no filtering. `Table` wires its value to `filterRows`;
another caller wires it wherever it likes. The focus ring is a box-shadow, not an
outline, so it follows the rounded corners.

## Tabs, Breadcrumbs, Skeleton

`Tabs` is Radix. It is **not** `.ma-tabs` in ui.css — those are the mobile
shell's *navigation* tabs, which swap routes and whose correct role is a nav.
These switch panels within one screen. Do not merge them.

Two things about Radix Tabs that will look like bugs and are not. Every panel
stays mounted with `hidden` on the inactive ones, so assert against
`[role="tabpanel"]:not([hidden])`. And **the tablist, not any trigger, is the
single tab stop** — every trigger reads `tabindex="-1"` until focus enters, at
which point Radix forwards it to the selected tab. That is roving focus working,
not a keyboard trap.

`Breadcrumbs` takes an `href` or an `onClick` per crumb, because `packages/ui`
must not depend on react-router. The last crumb is never a link. `maxItems`
collapses the middle behind a button — not an `…` character — so the hidden
levels stay reachable; the map hierarchy is seven levels deep.

Every `Skeleton` is `aria-hidden`. The caller owns the announcement by putting
`aria-busy` on the container.

## Accordion, Dropdown, ProgressBar

`Accordion` is Radix. A closed panel is **unmounted** — the opposite of `Tabs`,
whose inactive panels stay mounted with `hidden`. Do not assert on the text of a
collapsed section. The open/close animation needs a pixel height to travel to
(`height: auto` is not interpolable); Radix measures the panel and publishes it
as `--radix-accordion-content-height`, which the `accordion-down`/`-up` keyframes
in `apps/web/src/tailwind.css` consume. The content wrapper carries
`overflow-hidden` — drop it and the panel spills over the section below for the
180ms it animates. The chevron rotates via Tailwind v4's independent `rotate`
property, not a `transform`; `.transition-transform` covers it because v4's
`transition-transform` lists `rotate` among its properties. `type="single" |
"multiple"` is a discriminated union so `value` can't be the wrong shape.

`Dropdown` is Radix DropdownMenu — a *menu* (every item runs a command), never a
value picker. A field that picks a value stays a `<select>`. It sits at
`--z-overlay`, one below a dialog, and Radix portals it to the end of `<body>`,
so a Modal opened afterwards still wins on DOM order. Its panel uses a real
`border` (v4 gives `--tw-border-style` an initial `solid`, so no preflight
needed) rather than `Button`'s `shadow-[inset_…]` trick — an inset shadow and
`shadow-md` are one tailwind-merge group, and the second silently drops the
first.

`ProgressBar` is determinate with `value`, indeterminate without. The
indeterminate sweep survives `prefers-reduced-motion` on purpose: it is the only
thing reporting progress, and stopping it would leave a bar that says nothing. An
indeterminate bar carries no `aria-valuenow` — "unknown" is not a number.

## DatePicker

A single-date picker: a Radix Popover over an ARIA `role="grid"` calendar. Its
value on the wire is an ISO `YYYY-MM-DD` **string, never a `Date`** — a Date
cannot hold a calendar day without also holding a timezone, and midnight-local
round-trips to the previous day west of Greenwich.

The calendar math — the 6×7 grid, month rollover, leap years, min/max, the
per-day predicate — lives in `@marutham/lib/calendar`, pure and unit-tested (24
tests), the same split as `Table`. Dates there are a `{ year, month, day }`
civil triple; the one place a `Date` appears is UTC-boxed inside `weekdayOf` /
`addDays`, where it is safe. `DatePicker.tsx` is the popover, the grid markup and
the keyboard model (arrows day-by-day wrapping across months, PageUp/Down for
month, Home/End for the week, Enter/Space to pick).

**The trap this hides, found only by rendering under a western timezone:** the
grid is built with `Date.UTC(...)`, so every `Intl.DateTimeFormat` that prints a
month title, a trigger label or a weekday header **must pass `timeZone: 'UTC'`**.
Without it Intl formats in the browser's zone, and a user in the Americas sees
the trigger a day early, the title slipped into the previous month, and the
weekday header rotated by one. Invisible on a UTC/IST test box.

Week starts on Sunday (India's convention); pass `weekStartsOn={1}` for Monday.
`min`/`max` disable out-of-range days *and* the nav arrow that would only reach
disabled months.

## FileUpload

A drag-and-drop + browse picker. It reports **selection, not upload**: it picks
and validates files and reports them through `value`/`onChange`; the caller does
the transport and feeds progress and errors back through each item's
`status`/`progress`/`error`. Keeping transport out means one picker serves
base64 listing photos, multipart documents and whatever comes next without
knowing how any of them reach the server. An `uploading` item renders a
`ProgressBar`; a `done` item shows a check and drops its remove button.

Validation — `accept` matching (HTML syntax: `.pdf`, `image/*`, `image/png`),
`maxSize`, `maxFiles`, and de-duplication by name+size — lives in
`@marutham/lib/upload`, pure and unit-tested (17 tests), reading only
`{ name, size, type }` so it needs no `File` and ports to a React Native asset.
Rejections are reported most-specific-first (a wrong-type file that is *also*
over the count says `type`, not `count`).

This is **not** `apps/web`'s `ImagePicker`, which downscales to base64 data-URIs
in three fixed slots and is image-only. FileUpload is the general primitive;
ImagePicker stays as the specialised listing-photo control.

The drop zone is a `<button>` wrapping a visually-hidden `<input type="file">`,
so keyboard and pointer users reach the same OS dialog, and the input is cleared
after each pick — otherwise choosing the same file twice fires no `change`.

## Alert vs NotificationCenter vs Toast

Three different jobs, easy to confuse:

- **`Toast`** (app-level, `apps/web`) — transient, floats over the page, gone in
  a few seconds. Fire-and-forget confirmations.
- **`Alert`** — one persistent in-page callout (`info`/`success`/`warning`/
  `danger`) with an icon, optional title, body, action and dismiss. It sits in
  the layout and stays until the situation changes: the suspended-seller banner,
  an expiring subscription, a form-level error summary. `danger`/`warning` take
  `role="alert"` (interrupts); `info`/`success` take `role="status"`. Each tone
  is its semantic pair — `{tone}-bg` fill under `{tone}-fg` text — so it inherits
  the contrast-audited inks (warning text is `warning-fg`, not the 2.09:1 gold).
- **`NotificationCenter`** — the standing inbox: a header bell with an unread
  badge over a Radix Popover panel, items grouped Today / Yesterday / Earlier.

`NotificationCenter` is controlled and transport-free — the app owns `items` and
reacts to `onItemClick`/`onMarkRead`/`onMarkAllRead`. The list logic (unread
count, recency grouping, "time ago") is in `@marutham/lib/notifications`, pure
and unit-tested (18 tests). Unlike the calendar, its times are **real instants**
read in *local* time on purpose: a notification is grouped by the reader's
calendar day, and `now` is injectable so the grouping is deterministic under
test. The bell's `aria-label` carries the unread count; the count pill itself is
`aria-hidden` so a screen reader hears the number once, not twice.

## ChartContainer, MapContainer (Phase 2D)

The frame around a chart — never the chart. `packages/ui` must not pull in the
~1 MB ECharts bundle, so the chart is `children`: ECharts (or any other library,
or an RN chart) lives in the app and is handed in. The container gives every
dashboard tile the header, the fixed-height plot area, and the loading / empty /
error states the hand-rolled `<Card><h2/><EChart/></Card>` blocks never had. The
plot area holds its height across all four states, so a tile does not jump as
data loads. It is a `<figure>` named by its `<figcaption>` with an optional
`summary`, because a canvas chart is opaque to a screen reader.

`MapContainer` composes `ChartContainer` and adds two map things: a drill
breadcrumb (`drillPath`, reusing `Breadcrumbs` — country → state → district) and
a choropleth legend rendered as an accessible HTML scale, not the one ECharts
paints inside the canvas. The legend `stops` are passed in — from `sequential`
in `@marutham/tokens` — so the component stays palette-agnostic and light/dark is
the caller's choice of ramp.

`sequential` (in tokens) is the single-hue green magnitude ramp, one array per
theme, each stepped so its low-value end recedes toward *that* theme's surface.
Both arrays pass the dataviz ordinal validator (single hue, monotone lightness,
ΔL ≥ 0.06, low-value step ≥ 2:1 on its surface). **Re-run
`scripts/validate_palette.js` before touching a stop** — the greens are chosen,
not guessed.

## Sidebar (Phase 3)

The desktop navigation rail for the **Admin and Executive** portals only —
Farmer / Consumer / VCO / Delivery keep the `.ma-tabs` bottom bar, because a side
rail suits a wide console and a bottom bar suits a phone.

Router-agnostic like `Breadcrumbs`: an item carries an `href` or an `onClick`.
Which item is lit, and which groups open, come from `@marutham/lib/nav` against
`currentPath` — the same tested matcher the app can share, so "active" is never a
second hand-rolled string compare. Two rules there are load-bearing and easy to
get wrong:

- **Active is the single most-specific match, not per-item.** An Overview at
  `/admin` is an ancestor of every `/admin/*` route; a naïve per-item test keeps
  it lit on nested pages. `activeTrail` picks the item whose href is the *longest*
  prefix of the path — so on `/admin/employees/42` the Employees leaf wins over
  its Overview sibling, and only the real leaf is `aria-current`.
- **Groups on the active branch auto-expand** on load and on every route change,
  but a group the user opened or closed by hand is left alone — expansion state
  only ever gains the active trail, never loses the user's choices.

`collapsed` is the icon-only rail. A group can't expand inline there (no room for
a label), so clicking a collapsed group expands the rail first. Role-gating is
the caller's job via `filterNavByRole` *before* render — the component draws what
it is given. The collapse control uses an inset-shadow top divider, not
`border-t`: the `<button>` reset is `border-0`, and the two are one
tailwind-merge group.

## Header (Phase 3)

The top bar of the Admin / Executive shell, the horizontal partner to `Sidebar`.
Chrome, not content: it lays out slots the app fills with pieces already built —
a `Breadcrumbs`, a `SearchInput`, a `NotificationCenter`, a user `Dropdown` — and
owns none of them, so it stays free of i18n, auth and routing. One `<header>`
`banner` per page.

Responsive by construction. Below `lg` the sidebar is a drawer, so the header
grows a hamburger (wired to `onMenuClick`, hidden at `lg`+) and shows `brand`;
the breadcrumb and search need width and drop away below `md`. The `actions`
cluster is the one region visible at every width — notifications and the account
menu must always be reachable — and `ml-auto` pins it right whether or not the
search grows the middle.

## AppShell (Phase 3)

The Admin / Executive console layout, and the last piece of the shell: it puts
`Sidebar` and `Header` around the page and, below `lg`, turns the sidebar into a
slide-in drawer the Header's hamburger opens.

AppShell owns the drawer's open state, because two components must agree on it —
the Header raises it, the drawer consumes it. So `header` is a **render function**
handed `openNav` to wire onto the hamburger, while `sidebar` is a plain node used
in both places: the static rail at `lg`+ and the drawer below. Pass `currentPath`
and a navigation closes the drawer (setting it closed when already closed is a
no-op, so it is safe every render); a tap on a drawer link closes it too, while a
group toggle — a `<button>`, not an `<a>` — leaves it open. Growing back to `lg`
retires the drawer via a `matchMedia` listener.

The drawer is Radix Dialog, like `Sheet`: focus trap, scroll lock, Escape, and an
`aria-hidden` background. It has no `Dialog.Trigger`, so focus is returned to the
hamburger by hand with `useReturnFocus`. (Radix does **not** set `aria-modal` — it
hides the background instead, which is the more robust signal; don't assert on
`aria-modal`.) The slide uses `drawer-in`/`drawer-out` keyframes in
`apps/web/src/tailwind.css`, so Radix holds the unmount until the exit animation
ends.

## Input (Phase 4)

The text form control, and the first primitive of the Phase 4 form-screen
migration — the Tailwind replacement for the `.ma-input` class the app screens
wrote by hand. `INPUT_CLASS` is exported so `Select` and `Textarea` can wear the
same border, focus ring and invalid state when their screens move over. Styling
reads `aria-invalid`, which `Field` already sets on error, so a field goes red
with no extra prop.

`apps/web` can use it because `@tailwindcss/vite` scans the app source and
`ui.css` only styles the `.ma-*` *classes*, never bare elements — so a Tailwind
`<input>` without `.ma-input` is not outranked by the unlayered legacy CSS. (One
trap for the driver, not the code: `getComputedStyle` rounds a `1.5px` border to
`"1px"` — assert the border *colour* and style, not its sub-pixel width.)

## Migration status

Every component is rebuilt: `Button` `Card` `KpiCard` `Badge` `Spinner`
`EmptyState` `StatTile` `FilterChips` `QtyStepper` `StarRating` `OrderProgress`
`OrderTimeline` `Sheet` `Modal` `OrderPipeline`.

Phase 2E adds what the brief needs and never existed: `Table`, `Skeleton`,
`Breadcrumbs`, `Tabs`, `Accordion`, `Dropdown`, `ProgressBar`, `DatePicker`,
`FileUpload`, `Alert`, `NotificationCenter`, `Pagination`, `SearchInput`. That
completes the brief's primitive list. `Toast` stays app-level in
`apps/web/src/components/Toast.tsx`. Phase 2D adds `ChartContainer` and
`MapContainer` — the chart/map chrome, chart library handed in. Phase 3 builds the shared shell:
`Sidebar` (Admin/Executive rail), `Header` (the top bar), and `AppShell` (the
console layout that composes them, with the sidebar as a mobile drawer).

`OrderPipeline` keeps inline styles for two things on purpose: node width, which
the SVG path arithmetic reads, and colour, which is a runtime string
(`activeColor`). Everything static is a utility.

What is left in `ui.css` is styling for class names **`apps/web` writes by
hand**, so deleting it means editing app screens — Phase 4's job, now underway:

- `.ma-field`, `.ma-input`, `.ma-select` — `AddressFields`, `ProfileTab`,
  `ListingFormSheet`, `ProductsTab`. (`PasswordInput` is done: on `Input`, its
  `.ma-pw*`/`.ma-pwrules*` blocks deleted.)
- `.ma-tabs`, `.ma-tab`, `.ma-lang`, `.ma-iconbtn`, `.ma-appbody` — the shared
  mobile shell, in `ConsumerPage` and `FarmerPage`.

355 lines at the start of Stage 0, 80 now.
