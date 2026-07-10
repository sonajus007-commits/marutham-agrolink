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

## Migration status

Every component is rebuilt: `Button` `Card` `KpiCard` `Badge` `Spinner`
`EmptyState` `StatTile` `FilterChips` `QtyStepper` `StarRating` `OrderProgress`
`OrderTimeline` `Sheet` `Modal` `OrderPipeline`.

Phase 2E adds what the brief needs and never existed: `Table`, `Skeleton`,
`Breadcrumbs`, `Tabs`, `Accordion`, `Dropdown`, `ProgressBar`. Still missing —
`Pagination` (lives inside `Table`; extract when a second caller appears),
`DatePicker`, `FileUpload`, `Toast` (app-level in
`apps/web/src/components/Toast.tsx`), `Search` (likewise inside `Table`),
`Notifications`. The chart and map containers are Phase 2D.

`OrderPipeline` keeps inline styles for two things on purpose: node width, which
the SVG path arithmetic reads, and colour, which is a runtime string
(`activeColor`). Everything static is a utility.

What is left in `ui.css` is styling for class names **`apps/web` writes by
hand**, so deleting it means editing app screens — Phase 4's job:

- `.ma-field`, `.ma-input`, `.ma-select`, `.ma-pw*` — `PasswordInput`,
  `AddressFields`, `ProfileTab`, `ListingFormSheet`, `ProductsTab`.
- `.ma-tabs`, `.ma-tab`, `.ma-lang`, `.ma-iconbtn`, `.ma-appbody` — the shared
  mobile shell, in `ConsumerPage` and `FarmerPage`.

355 lines at the start of Stage 0, 101 now.
