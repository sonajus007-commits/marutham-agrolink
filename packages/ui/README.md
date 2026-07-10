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
- `pnpm tokens:literals` (CI) — no hard-coded colours anywhere.
- `pnpm tokens:contrast` (CI) — every semantic pair clears WCAG.

## Migration status

Rebuilt on Tailwind + cva: `Button` `Card` `KpiCard` `Badge` `Spinner`
`EmptyState` `StatTile`.

Still on `ui.css`: `Sheet` `Modal` `Field` `FilterChips` `QtyStepper`
`StarRating` `OrderPipeline` `OrderProgress` `OrderTimeline`, plus the shared
mobile shell (`.ma-tabs`, `.ma-lang`, `.ma-iconbtn`).
