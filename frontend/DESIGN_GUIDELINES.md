# Activity — Design Guidelines

Implementation-ready, token-driven UI guidance for the Hookfire Activity console.

**Version** 1.0 · **Surface** operator dashboard (dark only) · **Target** WCAG 2.2 AA

---

## 1. Context and goals

### 1.1 Design intent

**Activity is a calm, high-density operations console: every screen must make the state of webhook delivery legible at a glance, operable from the keyboard, and honest about what the engine actually knows.**

The console is not a marketing surface and not a general-purpose admin theme. It exists so an authenticated operator can answer four questions within seconds:

1. Is delivery healthy right now?
2. What failed, and why?
3. Which subscriber is causing it?
4. What do I do next (replay, inspect, register)?

### 1.2 Audience

Authenticated operators and engineers: on-call, platform, integrations. They are competent, impatient, and often reading a table at 03:00. They use keyboards and high-resolution displays, and they may use screen readers, magnification, or reduced motion.

### 1.3 Product principles

| # | Principle | Consequence |
|---|-----------|-------------|
| 1 | **State over decoration.** | Status, time, and outcome get the strongest typographic weight. Decoration never competes. |
| 2 | **One surface, one accent.** | Black canvas, raised panels, a single blue accent for links and focus. Status colors are the only other chromatic layer. |
| 3 | **Density with air.** | Tables are dense; page sections are separated by generous vertical rhythm. Never both at once. |
| 4 | **Keyboard parity.** | Every pointer action has a keyboard path and a visible focus state. |
| 5 | **Truthful UI.** | Never imply history the engine does not store, never imply a delivery succeeded when it is in flight, never hide an error behind a generic toast. |
| 6 | **Reversible actions.** | Destructive actions are confirmed, named after their object, and explain the consequence. |

### 1.4 Success criteria

- A new operator can identify the current failure mode of the engine within 10 seconds of landing on Activity.
- Every interactive element is reachable and operable with the keyboard alone, with focus never invisible.
- No text below the AA contrast floor on its actual rendered surface.
- No screen ships a component without defined states; no spacing or type value exists outside the token scale.
- Component density stays within budget: ≤ 70 links, ≤ 39 buttons, ≤ 14 cards, exactly 2 navigation landmarks per page (see §3.12).

### 1.5 Scope

**In scope:** Activity, Events, Event detail, Deliveries, Delivery detail, Endpoints, Endpoint detail, Dead letter, Metrics, Settings, Connect, 404, command palette, all global dialogs and sheets.

**Out of scope:** email, marketing pages, light theme, tenant billing, mobile-native. The console is responsive down to 360 px but is designed for 1280 px and above.

### 1.6 Stack (normative)

- **React 19 + TypeScript**, Vite, React Router.
- **Tailwind CSS v4** with `@theme` tokens; the token layer is `src/index.css` and is the only place raw values may exist.
- **shadcn/ui primitives** on Radix (Dialog, DropdownMenu, Tabs, Tooltip, Switch, Label, Slot) plus a small number of handwritten primitives (Table, Input, Badge, Card, Select, Command).
- **TanStack Query** for every server read and mutation. No ad-hoc `useEffect` fetching.
- **zod** for form validation, **sonner** for toasts, **cmdk** for the command palette, **lucide-react** for icons.
- Charts are hand-built SVG; no charting dependency. The engine exposes counters, so charts render a labelled session window, never "history".

---

## 2. Design tokens and foundations

### 2.1 Token architecture

Three layers, one direction:

```
brand values (raw, §2.2)  →  semantic tokens (§2.3)  →  component classes
```

Component guidance and component code **must** reference semantic tokens (`bg-surface-raised`, `text-fg-muted`, `motion-duration-fast`). Raw hex is legal **only** in the token definition block in §2.2 and in `src/index.css`. A raw hex in a component is a defect.

### 2.2 Brand values (the only place raw values live)

| Group | Token | Value |
|---|---|---|
| Surface | `surface.base` | `#000000` |
| Surface | `surface.muted` | `#ffffff` |
| Surface | `surface.raised` | `#242424` |
| Surface | `surface.strong` | `#2e2e2e` |
| Surface | `control.base` | `rgba(255,255,255,.06)` |
| Surface | `control.hover` | `rgba(255,255,255,.12)` |
| Surface | `control.active` | `rgba(255,255,255,.16)` |
| Text | `text.primary` | `#fafafa` |
| Text | `text.secondary` | `#808080` |
| Text | `text.tertiary` | `#aeaeae` |
| Text | `text.inverse` | `#a2bcff` |
| Type | `font.family.primary` | `Inter` |
| Type | `font.family.stack` | `Inter, Inter Fallback, sans-serif` |
| Type | `font.size.base` | `13px` |
| Type | `font.weight.base` | `440` |
| Type | `font.weight.medium` | `530` |
| Type | `font.lineHeight.base` | `20px` |
| Space | `space.1 … space.8` | `2, 4, 6, 8, 10, 11, 12, 15px` |
| Radius | `radius.xs` | `6px` |
| Shadow | `shadow.1` | `rgba(0,0,0,.4) 0 1px 2px, rgba(255,255,255,.2) 0 0 0 .5px, rgba(255,255,255,.1) 0 -.5px 0` |
| Motion | `duration.instant` | `85ms` |
| Motion | `duration.fast` | `120ms` |
| Motion | `duration.normal` | `150ms` |
| Motion | `duration.slow` | `200ms` |

### 2.3 Semantic tokens

Every token below is implemented in `src/index.css`. Components must use these names.

| Semantic token | CSS variable | Class | Use for | Never use for |
|---|---|---|---|---|
| `surface` | `--surface-base` | `bg-surface` | Page canvas, sheets, code blocks, inputs | Content grouping |
| `surface-raised` | `--surface-raised` | `bg-surface-raised` | Dialogs, menus, toasts, badges | Full-page backgrounds |
| `surface-raised/35` | — | `bg-surface-raised/[0.35]` | Card fill over the canvas | Interactive targets |
| `surface-strong` | `--surface-strong` | `bg-surface-strong` | Hover fill, selected nav, switch track | Page canvas |
| `surface-inverse` | `--surface-muted` | `bg-surface-inverse` | High-emphasis primary button | Large areas |
| `control` | `--control-base` | `bg-control` | Neutral control fill (buttons, icon actions, quiet toolbars) | Page canvas |
| `control-hover` | `--control-hover` | `bg-control-hover` | Hover fill for `control` | Default state |
| `control-active` | `--control-active` | `bg-control-active` | Pressed/expanded fill for `control` | Hover state |
| `fg` | `--text-primary` | `text-fg` | Primary text, values, titles | Metadata you want de-emphasised |
| `fg-muted` | `--text-secondary` | `text-fg-muted` | Secondary text on `surface` and tinted fills | Text on full `surface-raised` |
| `fg-subtle` | `--text-tertiary` | `text-fg-subtle` | Secondary text on `surface-raised`; mono ids; JSON | Body copy |
| `accent-ink` | `--text-inverse` | `text-accent-ink` | Links, active filter text, accent icons | Static emphasis |
| `line` | `--line-subtle` | `border-line` | Decorative separators, card borders, table rules | The only boundary of a control |
| `line-strong` | `--line-strong` | `border-line-strong` | Control boundaries (inputs, selects, outline buttons) | Decorative separators |
| `focus` | `--focus-ring` | `outline-focus` / `.focus-ring` | Focus indicators | Text color |
| `success` | `--status-success` | `text-success`, `bg-success/10` | Delivered, online, healthy | Anything not a positive outcome |
| `warning` | `--status-warning` | `text-warning` | Retrying, near-limit | Errors |
| `danger` | `--status-danger` | `text-danger` | Dead letter, failure, destructive | Emphasis |
| `info` | `--status-info` | `text-info` | In flight, processing, live | Success |
| `neutral` | `--status-neutral` | `text-neutral` | Pending, unknown | Active states |

**Status tokens are a documented extension** of the brand palette: the product's state vocabulary (pending, processing, delivered, retrying, failed, dead letter) cannot be expressed by four neutrals and one blue. They are semantic tokens, defined once, and must not be re-derived per feature.

**Why `fg-subtle` exists next to `fg-muted`:** `#808080` on `#242424` measures ~3.9:1 and fails AA for body text at 11–13 px. `fg-muted` is therefore restricted to `surface` and translucent card fills (≥ 4.9:1). On full `surface-raised` (dialogs, menus, toasts) use `fg-subtle` (~7.0:1) or `fg` (~14.9:1). This rule is non-negotiable and is checked in QA.

### 2.4 Colour usage rules

- **Must** express state with a status token plus text; colour alone is never the only signal.
- **Must** keep the canvas black. There is no light theme and no per-page background tint beyond `surface-raised/[0.35]`.
- **Must** use `accent-ink` for links and the focus ring only; it is not a decorative accent.
- **Should** use at most one chromatic status per row; two competing badges make a table unscannable.
- **Must not** tint an entire card with a status colour. Use a left border, a badge, or a status dot.

### 2.5 Contrast matrix (measured, AA thresholds)

| Foreground | Background | Ratio | Allowed |
|---|---|---|---|
| `fg` #fafafa | `surface` #000 | 20.4:1 | Everything |
| `fg` | `surface-raised` #242424 | 14.9:1 | Everything |
| `fg-subtle` #aeaeae | `surface` | 9.5:1 | Everything |
| `fg-subtle` | `surface-raised` | 7.0:1 | Everything |
| `fg-muted` #808080 | `surface` | 5.3:1 | Body text ≥ 4.5:1 |
| `fg-muted` | card fill (35% raised) | 4.9:1 | Body text, just clears |
| `fg-muted` | `surface-raised` | 3.9:1 | **Non-text only** (icons ≥ 3:1) |
| `accent-ink` #a2bcff | `surface` | 8.2:1 | Links, focus ring |
| `success` #3fb950 | `surface` | 8.3:1 | Text + icons |
| `warning` #d29922 | `surface` | 8.3:1 | Text + icons |
| `danger` #f85149 | `surface` | 6.3:1 | Text + icons |
| `line-strong` (38% white ≈ #616161) | `surface` | 3.4:1 | Control boundaries (1.4.11) |
| `focus` | any surface | ≥ 8.2:1 | Focus indicator |

If a pair is not in this table, it **must** be measured before shipping. "It looks fine" is not evidence.

### 2.6 Typography

**Family.** Inter Variable, fallback `Inter, Inter Fallback, sans-serif`. Monospace (`SFMono-Regular`, `ui-monospace`) is reserved for identifiers, payloads, URLs, metric names, and code.

**Base.** `13px / 20px`, weight `440`. This is the body and table text size. Do not set a different body weight.

**Scale — four steps, no exceptions:**

| Step | Size | Line height | Class | Use |
|---|---|---|---|---|
| `2xs` | 11px | 16px | `text-2xs` | Metadata, table headers, badges, keyboard hints, captions. Never paragraphs. |
| `xs` | 13px | 20px | `text-xs` | Body, table cells, inputs, nav items, card titles |
| `sm` | 15px | 22px | `text-sm` | Dialog titles, page section leads, login form title |
| `md` | 21px | 28px | `text-md` | Page H1 only (one per page) |

**Weight:** `440` body, `530` labels, buttons and badges, `600` headings and numeric values. Use `font-medium`/`font-semibold`; never add a fourth weight.

**Tracking:** `-0.02em` on `md` headings and large numeric values, `-0.01em` on `sm`/card titles, `0` elsewhere.

**Numerals:** tables and metrics **must** use `font-variant-numeric: tabular-nums` (set globally on `table`, and on metric values) so columns align.

**Rules:**
- **Must** use exactly one `text-md` element per page, and it is the H1.
- **Must** keep `text-2xs` to labels, metadata, and badges; never a sentence longer than one line.
- **Must not** use `text-sm` for body copy; it is a title/lead step.
- **Must not** use condensed, italic, or all-caps transforms.
- **Should** truncate long identifiers with `truncate` and expose the full value via `title` or the detail view, never by wrapping a monospace id across four lines.

### 2.7 Spacing

The brand scale maps to Tailwind numeric padding/gap/margin utilities:

| Token | Value | Utility examples |
|---|---|---|
| `space.1` | 2px | `p-1`, `gap-1` |
| `space.2` | 4px | `p-2`, `gap-2` |
| `space.3` | 6px | `p-3`, `gap-3` |
| `space.4` | 8px | `p-4`, `gap-4` |
| `space.5` | 10px | `p-5`, `gap-5` |
| `space.6` | 11px | `p-6`, `gap-6` |
| `space.7` | 12px | `p-7`, `gap-7` |
| `space.8` | 15px | `p-8`, `gap-8` |

**Component heights** use the 4 px base so layout stays predictable: `h-[28px]` (small controls, top bar strip), `h-[32px]` (default input/button/nav row), `h-[40px]` (large button), `h-[48px]` (app chrome), `h-[18px]` (kbd). Because the brand spacing keys override Tailwind's numeric spacing namespace, height utilities **must** be written as arbitrary values (`h-[32px]`), never `h-8` (which resolves to 15 px).

**Rhythm:**
- Inside a control: `gap-2` (4 px) to `gap-3` (6 px).
- Inside a card: `gap-2` between label and value, `gap-4` between groups, `p-8` (15 px) padding.
- Between page sections: `gap-8` (15 px) vertical.
- Page gutter: `px-4` mobile, `px-8` ≥ 768 px.

**Rules:**
- **Must** use the nearest token. `p-[9px]`, `gap-[5px]`, `mt-[13px]` are defects.
- **Must not** add margin to a component to fix its parent's layout; use the parent's `gap`.
- **Should** prefer `gap` over margins inside flex/grid; margins are for prose only.
- **Must** use `space-y`/`gap-*` (not `<br>` or empty divs) for vertical rhythm.

### 2.8 Radius, elevation, borders

- **Radius:** `6px` everywhere — controls, cards, dialogs, sheets, badges, popovers. No second radius. Icon buttons are also 6 px; circles are permitted only for status dots, avatars, and the switch thumb.
- **Elevation:** exactly one shadow, `shadow-1`, used only for floating layers (dialog, sheet, menu, popover, tooltip, toast, switch thumb). **Must not** be used on cards, tables, or hover states.
- **Borders:** 1 px. `border-line` for structure, `border-line-strong` for interactive boundaries. **Must not** combine a strong border with a shadow on the same control.

### 2.9 Motion

| Token | Duration | Class | Use |
|---|---|---|---|
| `instant` | 85 ms | `duration-[85ms]` | Hover/active on rows, menu items, icon buttons |
| `fast` | 120 ms | `duration-[120ms]` | Colour/border transitions on inputs, buttons, tabs, switch |
| `normal` | 150 ms | `duration-[150ms]` | Dialog enter/exit, card border transition |
| `slow` | 200 ms | `duration-[200ms]` | Sheet slide, chart width changes |

- **Must** respect `prefers-reduced-motion`: the global stylesheet collapses animation and transition durations to 0.01 ms, disables smooth scrolling, and the two keyframe animations (`hf-shimmer`, `hf-pulse`) stop.
- **Must not** animate layout properties (`height`, `width`, `top`) except chart bars/paths where the change communicates data; use `transform`/`opacity` elsewhere.
- **Must not** add enter animations to table rows; the feed updates every 5 s and would flicker.
- **Should** keep looping animations to the live indicator (`hf-pulse`) and the loading shimmer only.

### 2.10 Focus

- **Must** show a 2 px `focus` outline with a 2 px offset on every focusable element. The global `:focus-visible` rule guarantees this even for elements that forget the utility.
- **Must** use the `.focus-ring` treatment (2 px surface gap + 2 px accent ring) inside dense rows, menus, and dark overlays where an outline could be clipped by `overflow: hidden`.
- **Must not** set `outline: none` without replacing it with an equally visible indicator.
- **Must** keep the indicator visible against both `surface` and `surface-raised`.
- **Should** use `focus-visible` semantics so pointer clicks do not flash a ring, while keyboard focus always does.

### 2.11 Iconography

- **Must** use lucide icons at 13, 14, 15, 16, or 20 px via explicit `size-[Npx]` (the named spacing scale changes what `size-4` means; do not rely on it).
- **Must** mark decorative icons `aria-hidden="true"`.
- **Must** give every icon-only button an `aria-label` that names the object and the action ("Deactivate payment-service", not "Delete").
- **Must not** use an icon as the only label for a primary action.
- **Should** pair a status dot with a text label; the dot alone is not accessible.

### 2.12 Layout and density budget

**Chrome:** fixed 236 px sidebar (`lg` and up), 48 px top bar, 48 px sidebar brand strip, max content width 1400 px, page gutter 16/32 px.

**Breakpoints:** base < 640, `sm` ≥ 640, `md` ≥ 768, `lg` ≥ 1024, `xl` ≥ 1280. The navigation collapses to a sheet below `lg`.

**Density budget per page** (the Activity page is the reference envelope):

| Element | Budget | Where it comes from |
|---|---|---|
| Links | **70 max** | Sidebar nav 9, top bar 3, footer 2, metric cards 0, table rows 25 × 2 (event + endpoint), pagination 2, command palette 0. |
| Buttons | **39 max** | Page actions 3, filter/toolbar 4, table row actions 25, pagination 2, dialog/sheet 5. |
| Cards | **14 max** | 4 stat cards, 1 feed card, 1 chart card, up to 8 endpoint cards in a grid. |
| Navigation patterns | **2** | Primary sidebar and pagination — at most two `<nav>` landmarks per page (`Primary`, `Pagination`). |

- **Must** keep the page to one H1 and one primary action.
- **Must** paginate server-side at 25 rows (max 200). Never render an unbounded list.
- **Must not** add a second sticky bar or a floating action button; the top bar owns global actions.
- **Should** collapse non-essential columns below `md` (`hidden md:table-cell`) rather than shrinking type or wrapping cells.

---

## 3. Component-level rules

Every interactive component below defines **default, hover, focus-visible, active, disabled, loading, error**. If a state does not apply, the table says so explicitly — silence is not allowed.

### 3.1 Button

**Anatomy:** optional leading icon (16 px) · label (13 px, medium) · optional trailing icon. Gap `gap-2`, horizontal padding `px-8` (15 px) at 32/40 px and `px-6` (11 px) at 28 px, height `h-[32px]`, radius 6 px.

**Variants**

| Variant | Fill | Border | Text | Use |
|---|---|---|---|---|
| `default` | `surface-inverse` (white) | none | `primary-foreground` (black) | The single primary action on a screen |
| `secondary` | `control` (6% white) + `shadow-1` | none (the shadow supplies the hairline) | `fg` | Secondary action inside a dense surface |
| `outline` | transparent | `line-strong` | `fg` | Toolbar and row actions that need a boundary |
| `ghost` | transparent | none | `fg-muted` → `fg` on hover | Icon actions, tertiary navigation |
| `danger` | `danger/10` | `danger/30` | `danger` | Destructive confirmation only |
| `link` | transparent | none | `accent-ink` | Inline navigation inside prose |

**Sizes:** `sm` 28 px/11 px text/`px-6` · `default` 32 px/13 px/`px-8` · `lg` 40 px/15 px/`px-8` · `icon` 32×32 · `icon-sm` 28×28.

**States**

| State | Visual | Behaviour |
|---|---|---|
| Default | As variant | — |
| Hover | `default`: white at 90%; `secondary`/`outline`/`ghost`: `control-hover` | Pointer only; duration 120 ms |
| Focus-visible | `.focus-ring` (2 px offset ring) | Always visible, including on dark cards |
| Active | `control-active` (or one further surface step); no transform | Must not shift layout |
| Disabled | `opacity-45`, `pointer-events-none` | Keep the label readable; add a tooltip explaining why when the reason is not obvious |
| Loading | Spinner replaces nothing — it is prepended, label stays, `aria-busy="true"`, `sr-only` "Working" | Button is disabled while pending; width must not jump |
| Error | Buttons do not own error state; the mutation surfaces a toast and the form surfaces a `FieldError` | Never colour a button red after a failed request |

**Keyboard:** `Tab` reaches it, `Enter` and `Space` activate. Disabled buttons are removed from the tab order by the native attribute.
**Pointer:** full 28–40 px target; hover may preview the action but must not fire it.
**Touch:** minimum 32×32 px target, 8 px separation; no hover-only affordances.

**Edge cases:** label wraps to two lines only in `link`; icon-only buttons `must` have `aria-label`; never render a loading button without a stable label, or the button resizes mid-click.

---

### 3.2 Links and row links

**Anatomy:** text (13 px), optional trailing external icon (12 px). Underline only on hover for in-app links; body copy links use `accent-ink` + hover underline.

| State | Visual |
|---|---|
| Default | `accent-ink` (in prose/tables) or `fg` (as a row title) |
| Hover | Underline; row-title links shift to `accent-ink` |
| Focus-visible | `.focus-ring`, rounded 6 px |
| Active | `accent-ink` at 80% |
| Disabled | Not applicable — use plain `fg-muted` text, never a dead link |
| Loading | Not applicable |
| Error | Not applicable |

**Keyboard:** standard link semantics; `Enter` follows. File downloads and external links `must` carry `rel="noreferrer"` and an external icon.
**Touch:** rows are full-width targets via an absolutely positioned overlay or a single wrapping link — never a 13 px text-only target.

**Edge cases:** an id must never be the only link text ("Open event evt_123" is acceptable; "click here" is not). If a row has more than one link, they must not nest.

---

### 3.3 Text input and textarea

**Anatomy:** label (13 px, `fg`, weight 530) · control (32 px, `surface` fill, 1 px `line-strong`, radius 6 px, `px-4`) · optional help text (11 px) · optional error (11 px, `danger`, `role="alert"`).

| State | Visual |
|---|---|
| Default | `bg-surface`, `border-line-strong`, placeholder `fg-muted` |
| Hover | `bg-surface-raised/30` (boundary stays ≥ 3:1) |
| Focus-visible | `.focus-ring` + border keeps `line-strong` |
| Active | Not distinct from focus |
| Disabled | `opacity-45`, `cursor-not-allowed` |
| Loading | Not applicable — disable the form while its mutation is pending |
| Error | `aria-invalid="true"`, border `danger/60`, `FieldError` linked via `aria-describedby` |

**Keyboard:** `Tab` in, native text editing, `Enter` submits only a single-line field inside a form; `Escape` closes the surrounding dialog.
**Pointer:** label and control are separate; clicking the label focuses the control (`htmlFor`).
**Touch:** 32 px height; `inputMode` set per field (`url`, `numeric`); no custom keyboards invented.

**Edge cases:** long values scroll horizontally, never wrap; passwords and secrets use `type="password"` and `autoComplete="off"`; help text and error text must both be referenced by `aria-describedby` when both exist; a textarea is resizable vertically only.

---

### 3.4 Select

**Anatomy:** native `<select>` with a decorative chevron and the same box as an input.

- **Must** use the native element. It is keyboard- and screen-reader-complete and touch-native by default.
- **Must** style `<option>` with `surface-raised`/`fg` so dark-mode OS menus stay legible.
- **Must** provide an accessible name via a visible label or `aria-label`.
- States follow §3.3 exactly.
- **Edge cases:** with more than ~50 options, use the command palette pattern instead; never render an unsearchable 500-option select.

---

### 3.5 Switch

**Anatomy:** 34×20 px track, 14 px thumb, no visible label inside the control.

| State | Visual |
|---|---|
| Off | `surface-strong` track, thumb at left |
| On | `accent-ink` track, thumb at right |
| Hover | Track lightens one step |
| Focus-visible | `.focus-ring` |
| Active | Thumb moves on `fast` (120 ms) |
| Disabled | `opacity-45`, `cursor-not-allowed` |
| Loading | Not applicable; optimistic toggles `must` revert and toast on failure |
| Error | Revert the toggle and surface a toast; do not leave the switch lying |

**Keyboard:** `Space` toggles, `Enter` does not. The control has `role="switch"` and `aria-checked` from Radix.
**Touch:** 34×20 visual, padded hit area ≥ 44 px via the wrapping label where used.

---

### 3.6 Badge and status badge

**Anatomy:** 1 px border, 10% tint of its tone, tone text, 11 px medium, optional 6 px dot. Height 18–20 px, padding `px-2`.

**Variants:** `neutral`, `success`, `warning`, `danger`, `info`; shapes `default`, `dot`, `mono`.

**Rules**
- **Must** always show the label; the dot is supplementary.
- **Must** map status through `statusMeta()` so wording is identical everywhere (Pending, Processing, Delivered, Retrying, Failed, Dead letter).
- **Must** wrap an interactive status in a tooltip with a plain-language description, and make the wrapper focusable (`tabIndex=0`) with a composed `aria-label`.
- **Must not** use a badge as a button. Replay is a button.
- **Edge cases:** unknown statuses render the raw value in `neutral` with "Unknown status reported by the engine"; 99+ dead letters render as `99+` in navigation only, never in the table.

---

### 3.7 Card and stat card

**Anatomy:** `surface-raised/[0.35]` fill, 1 px `line`, radius 6 px, `p-8` (15 px). Stat card: label (11 px `fg-muted`) · value (21 px semibold, tabular) · hint (11 px) · optional 132×30 sparkline · optional footer separated by `border-line`.

**States:** a card is only interactive if it contains a link; the card itself has **no** hover, focus, active, disabled, loading, or error state. Interactive children own those states. A card that navigates must expose exactly one link and a visible focus ring on it.

**Rules**
- **Must** keep the value as the visually dominant element; never compete with a badge.
- **Must** label the sparkline for assistive tech when it carries information beyond decoration (`role="img"` + `aria-label`), or mark it `aria-hidden` when the numeric value already states the same fact.
- **Must** state the unit ("p99 latency", "per second") in the label, not the value.
- **Edge cases:** a missing metric renders `—`, never `0`, which would claim a measured zero.

---

### 3.8 Table

**Anatomy:** `<table>` inside a focusable scroll region (`role="region"`, `aria-label`, `tabIndex=0`), sticky-free header at 32 px, rows at ~40 px, cells `px-8` (15 px), row divider `border-line`.

**States**

| State | Visual |
|---|---|
| Default | Row text `fg`, metadata `fg-muted` |
| Hover | `surface-raised/60` fill on the whole row |
| Focus-visible | `.focus-ring` on the inner link/button, not the row |
| Active (`data-state=selected`) | `surface-raised` fill |
| Disabled | Not applicable |
| Loading | Replace the body with `LoadingState` skeleton rows; keep the header and announce "Loading" via `role="status"` |
| Error | Replace the body with `ErrorState` + a retry button |
| Empty | Replace the body with `EmptyState` that names the active filter set |

**Rules**
- **Must** use `scope="col"` on headers and a caption or `aria-label` on the scroll region.
- **Must** keep numeric columns tabular and right-aligned; time columns use relative time with an absolute `title` and `dateTime` on `<time>`.
- **Must** identify rows by their primary link; the trailing icon button repeats the object id in its label.
- **Must** hide optional columns at `sm`/`md`/`lg` instead of shrinking type.
- **Must not** put a button inside a link or nest interactive elements.
- **Edge cases:** a 64-character monospace id truncates; the endpoint URL truncates to host+path via `prettyUrl`; long error strings truncate in the table and render fully in the detail sheet.

---

### 3.9 Dialog and sheet

**Anatomy:** Radix portal · overlay `black/75` + 2 px blur · panel `surface-raised`, 1 px `line`, radius 6 px, `shadow-1`, `p-8`; sheet variant `surface`, right side, max 560 px, slides in on `slow`.

| State | Behaviour |
|---|---|
| Default | Focus moves to the first focusable element or the panel |
| Hover | Panel does not react; controls inside do |
| Focus-visible | Contained focus ring; focus is trapped inside the layer |
| Active | Overlay click and `Escape` close unless the action is destructive-in-flight |
| Disabled | While a mutation is pending, the confirm button shows loading, the cancel button is disabled, and `Escape` still closes |
| Loading | The trigger keeps its own loading state; the dialog opens immediately and shows skeleton content |
| Error | The dialog stays open, the error renders inline (`role="alert"`) and/or as a toast; closing on failure is prohibited |

**Keyboard:** `Tab`/`Shift+Tab` cycle inside, `Escape` closes, `Enter` submits the form. Focus returns to the trigger on close.
**Pointer:** overlay click closes; the panel must stop propagation.
**Touch:** sheet is full-width below 640 px; the close target is ≥ 32 px.

**Edge cases:** dialogs taller than the viewport scroll internally (`max-h-[calc(100vh-64px)]`); a dialog must never nest another dialog except the command palette over a page (never over another dialog); `aria-describedby` is required for dialogs with body copy, and explicitly `undefined` when the panel has no description.

---

### 3.10 Dropdown menu and command palette

**Menu:** Radix, `surface-raised`, `shadow-1`, min 200 px, items 32 px, icons 14 px. Items use `focus:bg-surface-strong` (which is also the hover/keyboard-active state). Labels are `fg-subtle` at 11 px.

**Command palette:** `cmdk` inside a dialog, input 40 px, groups, items 32 px, footer with key hints. Selected item = `surface-strong`.

**States**

| State | Behaviour |
|---|---|
| Default | Closed, trigger is a normal button |
| Hover | Item fill `surface-strong` |
| Focus-visible | Item fill `surface-strong`; the palette input keeps the ring |
| Active | Item activates on `Enter` |
| Disabled | `opacity-45`, `pointer-events-none`; keep the label visible |
| Loading | Search results are local; if remote results are added, show a single "Searching…" row, never a spinner that shifts layout |
| Error | A failed action closes the menu and surfaces a toast |

**Keyboard:** `⌘K`/`Ctrl+K` toggles the palette anywhere; `↑`/`↓` move, `Enter` runs, `Escape` closes, `?` opens it when focus is not in a field.
**Touch:** menu items ≥ 32 px; the palette is not the only path to any action.

**Edge cases:** no results renders "No matches found."; endpoint results cap at 8 with the full list one navigation away; the palette must not steal `⌘K` while an input has a composition event active.

---

### 3.11 Tabs, filters, search, pagination

**Tabs:** Radix, 24 px trigger, container `surface-raised/60` + `line`, active `surface-strong` + `fg`, inactive `fg-muted`. `aria-label` on the list ("Filter by delivery status").

**Search:** 260 px input with a leading search icon and a clear button. Debounce 300 ms; the query is server-side; the clear button is a 32 px target labelled "Clear search". `Escape` clears the field.

**Filters:** server-side; every filter change resets pagination to offset 0. Deep-linkable filters (`status`, `endpoint_id`) write to the URL with `replace`.

**Pagination:** `nav aria-label="Pagination"`, Previous/Next with icons, "Showing 1–25 of 902 deliveries". Previous is disabled at offset 0, Next at the last page. **Must not** render a page-number list; offset pagination is enough for this product.

**States:** empty with filters → "No deliveries match these filters" + Clear filters; empty without filters → onboarding copy + the primary action. Loading uses `keepPreviousData` so the table does not collapse between pages; a subtle `opacity-60` on the body is acceptable, but **must not** replace the table with a spinner on every keystroke.

---

### 3.12 Navigation (exactly two landmarks)

**Primary sidebar:** `<nav aria-label="Primary">`, 32 px items, icon 15 px + label, active `surface-raised` + `fg`, hover `surface-raised/60` + `fg`, focus ring, dead-letter count badge. Brand strip 48 px; footer shows engine readiness and `⌘K` hint.

**Top bar:** breadcrumb label, command trigger, refresh, Send event, account menu. Not a `nav` landmark.

**Pagination:** the only other `<nav>` on a page.

**Rules**
- **Must** use a skip link as the first focusable element ("Skip to content").
- **Must** mirror every sidebar destination in the command palette.
- **Must** collapse the sidebar into a modal sheet below `lg`, with `aria-label="Navigation"` and focus trapping.
- **Must not** add a third `<nav>`; breadcrumb and tab lists are not navigation landmarks.
- **Should** keep the dead-letter count in the sidebar so the operator sees the queue without visiting it.

---

### 3.13 Toasts

`sonner`, bottom-right, max 4 visible, dark theme, `surface-raised`, `border-line`, `shadow-1`, title 13 px `fg`, description 11 px `fg-subtle`.

- **Must** be the secondary channel. Inline errors are required for form fields and blocking failures.
- **Must** use a verb-led title ("Endpoint deactivated") and a factual description ("No new deliveries will fan out to it.").
- **Must** announce politely (sonner's live region) and auto-dismiss in ~4 s; errors may persist longer.
- **Must not** be the only place a destructive action's failure is reported while its dialog closes.

---

### 3.14 Empty, error, loading, and 404 states

| State | Rule |
|---|---|
| **Loading** | Skeleton rows that match the table's final geometry; `role="status"` + `sr-only` "Loading"; never a full-page spinner. |
| **Empty (no data)** | Icon, a specific title, one sentence of cause, one primary action. Must never say "No data". |
| **Empty (filtered)** | Name the filters, offer Clear filters, and keep the filter controls visible. |
| **Error** | Title, the engine's message (or the network failure), a retry button. 401 replaces the body with "Session expired" and no retry. |
| **404** | "This page does not exist", a back-to-Activity action, and a secondary browse action. |
| **Offline / unreachable** | The sidebar readiness chip flips to "Engine unreachable" with a danger dot; the feed keeps its last data and the error state offers retry. |

---

### 3.15 Charts

Hand-built SVG, `viewBox` scaled to width, `aria-label` describing latest and peak, grid lines at 25/50/75% with 8% opacity, area fill at 8%.

- **Must** state the window in copy ("session-local window", "collecting samples…").
- **Must** render an explicit empty state with fewer than two samples.
- **Must not** animate on every poll; only the width transition at `slow` (200 ms) and only when reduced motion is off.
- **Edge cases:** all-zero series render a flat line at the baseline, not an empty chart; a single spike must not clip (max is derived from data).

---

### 3.16 Identifiers, payloads, and copy affordances

- **Must** render ids in monospace at 11 px with `break-all` or `truncate` depending on context, and provide a copy button labelled with the object ("Copy delivery id").
- **Must** render JSON read-only as text (never `innerHTML`), collapsed beyond 12 lines with an explicit "Expand N lines" control and a 520 px max height.
- **Must** keep the copy button's success state for 1.6 s (check icon) and announce "Copied" via the tooltip.
- **Edge cases:** clipboard denial surfaces a toast ("Copy failed — clipboard access was blocked by the browser."); a 1 MiB payload must not push the page layout.

---

## 4. Accessibility requirements and testable acceptance criteria

### 4.1 Conformance target

WCAG 2.2 Level AA for the whole console. The criteria below are testable in implementation and in review; each has a pass/fail check.

### 4.2 Keyboard model

| Key | Behaviour |
|---|---|
| `Tab` / `Shift+Tab` | Move forward/back through focusable elements in DOM order |
| `Enter` | Activate buttons, links, menu items, submit forms |
| `Space` | Toggle switches, activate buttons |
| `↑` `↓` | Move within menus, tabs, and the command palette |
| `Home` / `End` | First/last item in menus and tab lists |
| `Escape` | Close the topmost dialog, sheet, menu, or palette; clear search when none is open |
| `⌘K` / `Ctrl+K` | Toggle the command palette |
| `?` | Open the command palette when focus is not in a text field |
| `Tab` inside a dialog | Cycles within the layer only |

### 4.3 Pointer and touch

- All targets ≥ 32×32 px, with ≥ 8 px separation in toolbars.
- Hover is never the only way to reveal an action or a tooltip's content; tooltips are supplementary and focusable triggers expose the same text.
- Row navigation works with a single tap on the row's primary link; no double-tap or long-press gestures.
- Drag is never required. No swipe-only actions.

### 4.4 Acceptance criteria

| ID | Criterion | Pass/fail check |
|---|---|---|
| A11Y-01 | Every interactive element is keyboard reachable and operable. | Tab through each page; all controls receive focus and activate with `Enter`/`Space`. |
| A11Y-02 | Focus is always visible. | Keyboard-tab through every page at 100% zoom; every stop shows a ≥ 2 px indicator with ≥ 2 px offset that is visible on its surface. |
| A11Y-03 | No focus trap except in modal layers. | Tab from the first to last control and back; focus never disappears into the browser chrome on a normal page. |
| A11Y-04 | Modal layers trap and restore focus. | Open every dialog/sheet/palette: `Tab` cycles inside, `Escape` closes, focus returns to the trigger. |
| A11Y-05 | Body text meets 4.5:1; large text and UI meet 3:1. | Sample every text/background pair against §2.5; no `fg-muted` on full `surface-raised`. |
| A11Y-06 | Control boundaries meet 3:1. | Inputs, selects, switches, and outline buttons are identifiable from their border/fill alone at 200% zoom. |
| A11Y-07 | Status is never colour-only. | Disable colour: every status still carries its text label. |
| A11Y-08 | Every control has an accessible name. | Accessibility inspection shows a non-empty name for every button, link, input, select, and switch; icon-only buttons use `aria-label`. |
| A11Y-09 | Every image/chart has a text alternative or is hidden. | Decorative SVG/icons are `aria-hidden="true"`; informative charts have `role="img"` + summary. |
| A11Y-10 | Tables are semantically structured. | Headers use `<th scope="col">`; the scroll region has `aria-label`; no `div`-grid masquerading as a table. |
| A11Y-11 | Errors are announced and associated. | Submit each form empty: `aria-invalid` is set, `aria-describedby` points at the message, and the message is in a live region or `role="alert"`. |
| A11Y-12 | Async updates are announced without stealing focus. | Loading uses `role="status"`; toasts announce politely; a refresh never moves focus. |
| A11Y-13 | Reduced motion is honoured. | With `prefers-reduced-motion: reduce`, no slides, pulses, or shimmer loops run. |
| A11Y-14 | Reflow works at 320 CSS px and 400% zoom. | No horizontal page scrolling at 320 px; tables scroll inside their labelled region, not the page. |
| A11Y-15 | Text spacing overrides do not break layout. | Apply 1.5× line height, 0.12em letter spacing, 2× paragraph spacing; no clipped or overlapping text. |
| A11Y-16 | Touch targets meet 24×24 minimum and 32×32 target. | Measure every button/icon target; none below 32×32 except inline text links. |
| A11Y-17 | The skip link works. | First `Tab` reveals "Skip to content"; activating it moves focus to `<main>`. |
| A11Y-18 | Exactly one H1 and a logical heading order per page. | Heading outline shows one H1, then H2/H3 with no skipped levels. |
| A11Y-19 | Navigation landmarks are unique and labelled. | At most two `<nav>` landmarks: "Primary" and "Pagination"; no unlabelled regions. |
| A11Y-20 | Destructive actions are confirmed and named. | Deactivate/clear flows open a dialog whose title names the object and whose body states the consequence. |
| A11Y-21 | Language and title are set. | `<html lang="en">`; each route sets a descriptive document title. |
| A11Y-22 | No keyboard trap from the palette. | `⌘K` twice, `Escape`, and `Tab` all leave the palette with focus restored. |

### 4.5 Screen-reader checks

- Activity feed: table name, column headers, and each row's event type + status + attempt count are announced in a sensible order.
- Status badge: the wrapper's accessible name is `"Retrying: A retryable failure was recorded; the next attempt is scheduled."`
- Delivery detail sheet: opening announces the sheet title; the attempt log is a list (`<ol>`) with each attempt's number, status, and latency.
- Sidebar readiness chip: announced as text ("Engine online"), not by colour.

---

## 5. Content and tone standards

### 5.1 Voice

Concise, confident, implementation-focused. The UI speaks like a senior engineer: it states what happened, what it means, and what to do next. It does not apologise, does not exclaim, and never uses marketing adjectives.

### 5.2 Style rules

- **Must** use sentence case for everything except proper nouns and metric names.
- **Must** use second person sparingly ("your endpoint"), and prefer the object ("the endpoint") in confirmations.
- **Must** lead with the verb in actions: "Send event", "Register endpoint", "Replay delivery", "Clear filters".
- **Must** name the object: "Deactivate payment-service", not "Deactivate" alone in a dialog title; "Copy delivery id", not "Copy".
- **Must** keep button labels ≤ 3 words and under 24 characters.
- **Must** use the present tense for state ("Delivered", "Retrying") and past tense for events ("Event accepted", "Endpoint deactivated").
- **Must** state consequences in destructive confirmations, including reversibility.
- **Must not** use "Are you sure?", "Oops", "Something went wrong", "Oopsie", "Uh oh", "Please", or exclamation marks.
- **Must not** blame the user ("You entered an invalid URL"); state the requirement ("Enter an absolute http(s) URL.").
- **Should** keep helper text to one sentence, ≤ 90 characters.

### 5.3 Vocabulary

| Concept | Use | Do not use |
|---|---|---|
| A subscriber destination | **endpoint** | webhook target, hook, subscriber URL |
| An inbound fact | **event** | message, payload (payload is the body only) |
| One event × endpoint attempt set | **delivery** | job, task, attempt (attempt is one HTTP try) |
| Terminal failure | **dead letter** | DLQ item, failed forever, lost |
| Re-queue from DLQ | **replay** | retry (retry is automatic) |
| Current state | **status** | state (in UI copy) |
| Automatic re-attempt | **retrying** | retry, backoff |
| Engine not reachable | **unreachable** | offline, down, dead |

### 5.4 Examples

| Context | Write | Not |
|---|---|---|
| Primary action | Send event | Submit |
| Dialog title | Deactivate payment-service? | Are you sure? |
| Dialog body | No new deliveries will fan out to this endpoint. History is preserved. | This will delete the endpoint. |
| Empty state | No deliveries yet | No data |
| Filtered empty | No deliveries match these filters | Nothing found |
| Error | Could not load this view | Oops! Something went wrong |
| Expired session | Session expired · The engine rejected the bearer token. Reconnect to continue. | Unauthorized |
| Field error | Enter an absolute http(s) URL. | Invalid URL |
| Toast | Delivery replayed · Original event id preserved — no duplicate event created. | Success! |
| Metric hint | 8 active workers | Workers: 8 (ok) |
| Secret warning | Copy the signing secret now. It is not shown again. | Don't forget your secret! |

### 5.5 Numbers, dates, identifiers

- Numbers: thousands compacted only in stat cards (`12.4k`), exact in tables and detail.
- Durations: `< 1000 ms` → `412ms`; `< 60 s` → `1.4s`; above → `1.2m`.
- Percentages: one decimal (`95.7%`); success rate is a ratio, never a count.
- Relative time for feeds (`12s ago`), absolute time on hover via `title`, and both in detail views.
- Identifiers keep their prefix (`evt_`, `ep_`, `dlv_`) and are never shortened by hand; truncate with the UI, not the data.
- Missing values render `—`, never `0` or "null".

---

## 6. Anti-patterns and prohibited implementations

### 6.1 Prohibited — visual

- Raw hex, `rgb()`, or `hsl()` in a component; all colour goes through a semantic token.
- A fifth type size, a second radius, a second shadow, or a one-off spacing value.
- Light mode, gradients, glassmorphism, glows, or decorative illustrations.
- Shadows on cards, tables, or hover states.
- Status colour as a full-card background or as the only difference between two states.
- More than one primary (white) button in a viewport.
- Uppercase labels, letter-spacing on body text, or centered body paragraphs.

### 6.2 Prohibited — interaction

- Hiding focus (`outline: none`) without an equally visible replacement.
- Hover-only actions, hover-only content, or tooltips carrying information that is not available on focus.
- Icon-only buttons without `aria-label`.
- Disabled controls without an explanation when the reason is not self-evident.
- Closing a dialog on mutation failure.
- Optimistic UI that leaves the screen lying after a failed request.
- A destructive action without a confirmation that names the object and its consequence.
- Nested interactive elements (button inside link, link inside label).
- Custom `<div>` dropdowns, tabs, or switches that lose native semantics.

### 6.3 Prohibited — content

- "Click here", "Submit", "OK", "Cancel" as the only label of a consequential action.
- "No data", "Nothing to show", or a bare spinner as an empty state.
- Exclamation marks, emoji, jokes, or apology copy.
- "Success!" as a toast title; state what changed.
- Ambiguous success: "Done" after replay without saying what was replayed.
- Implying history the engine does not have (charts labelled as historical when they are session-local).

### 6.4 Prohibited — implementation

- Fetching in `useEffect` instead of TanStack Query.
- A page-level spinner instead of layout-matched skeletons.
- Unbounded lists or client-side pagination over the full table.
- Passing raw API status strings into the UI without `statusMeta()`.
- Rendering user/engine content with `innerHTML`.
- Storing anything beyond the API base URL and bearer token in local storage.

### 6.5 Allowed exceptions (documented)

| Exception | Justification | Constraint |
|---|---|---|
| Status colour tokens | Delivery states cannot be expressed with four neutrals and one blue | Defined once in `index.css`; never re-derived per feature |
| `2xs` 11 px step | Dense tables and badges need a metadata step below 13 px | Labels and metadata only; never paragraphs; ≥ 4.5:1 on its surface |
| `line-strong` at 38% white | 16% failed 3:1 for control boundaries | Used only for interactive boundaries; decorative separators stay at 8% |
| Circle radii | Status dots, avatars, switch thumb | Never on a rectangular control |

---

## 7. QA checklist

Run on every pull request that touches UI. A single unchecked item blocks merge.

### 7.1 Tokens and consistency

- [ ] No raw hex, `rgb()`, `hsl()`, or arbitrary colour in components.
- [ ] No arbitrary spacing values (`p-[9px]`, `gap-[5px]`, `mt-[13px]`).
- [ ] Type sizes come only from `2xs`, `xs`, `sm`, `md`; one `md` H1 per page.
- [ ] Radius is 6 px on every rectangular surface; the only shadow is `shadow-1` on floating layers.
- [ ] Motion uses 85/120/150/200 ms and survives `prefers-reduced-motion`.
- [ ] Status wording comes from `statusMeta()`; no feature invents its own labels.

### 7.2 States

- [ ] Every interactive component defines default, hover, focus-visible, active, disabled, loading, and error (or documents why a state does not apply).
- [ ] Pending mutations disable their trigger and keep the label stable (no layout jump).
- [ ] Failed mutations keep the surface open and show an inline or toast error.
- [ ] Empty, filtered-empty, loading, and error states exist for every data surface.

### 7.3 Accessibility

- [ ] A11Y-01 through A11Y-22 in §4.4 pass.
- [ ] Contrast sampled for every new fg/bg pair; `fg-muted` never on full `surface-raised`.
- [ ] Keyboard-only pass through the changed flow, including dialogs and the palette.
- [ ] Icon-only controls have object-specific `aria-label`s.
- [ ] Forms set `aria-invalid` + `aria-describedby`; errors announce.
- [ ] Focus returns to the trigger after a layer closes.
- [ ] 320 px / 400% zoom pass with no page-level horizontal scroll.
- [ ] Screen-reader pass on the Activity table and one detail sheet.

### 7.4 Density and layout

- [ ] Page stays within 70 links, 39 buttons, 14 cards, 2 `nav` landmarks.
- [ ] Server-side pagination at 25 rows; optional columns collapse at `sm`/`md`/`lg`.
- [ ] Long ids, URLs, payloads, and error strings truncate without breaking layout.
- [ ] No second primary button; no second sticky bar.

### 7.5 Content

- [ ] Every action leads with a verb and names its object.
- [ ] Destructive confirmations state the consequence and reversibility.
- [ ] No banned words ("Oops", "Something went wrong", "No data", "Submit", "Click here").
- [ ] Numbers, units, and missing values follow §5.5.

### 7.6 Engineering

- [ ] `bun run build` passes (`tsc --noEmit` + Vite build).
- [ ] No console errors or warnings on the changed routes.
- [ ] TanStack Query keys and invalidation cover the changed data.
- [ ] No unused imports or dead components.
- [ ] New route is code-split and included in the command palette when it is a destination.
