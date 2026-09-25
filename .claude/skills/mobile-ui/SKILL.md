---
name: mobile-ui
description: Design system and screen conventions for the diet-tracker Vue app - the app shell (safe areas, bottom tab bar, sheets), colour and type tokens, dark and light themes, semantic macro and status colours, component set, screen states (loading, empty, error, offline), forms tuned for thumbs, motion rules, and how rings and bars are drawn. Use whenever building or changing any screen, component, style, chart, animation or form in apps/web, including "small" tweaks, so every slice looks like the same product.
---

# Mobile UI

## Intent
It has to look like something people would pay for, and it has to be usable one-handed on a phone while holding a fork. Bold numbers, calm surfaces, one accent, instant feedback. Dark is the design lead; light must be just as finished because it follows the system setting.

## App shell
- `100dvh` layout, content scrolls, header and bottom bar fixed. Padding uses `env(safe-area-inset-*)` so the iPhone home indicator and notch never cover anything. `viewport-fit=cover` in the meta tag.
- Bottom tab bar, four tabs: **Today**, **Log**, **Week**, **You**. The Log tab is a raised circular "+" that opens the quick-add sheet from anywhere; that is the app's primary action and it must be reachable by a thumb.
- Screens are single-column, max width 480 px centred on larger screens so desktop is just a wide phone.
- Modal actions come up as bottom sheets (Reka UI Dialog styled as a sheet), never centred modals. Sheets have a drag handle, a visible close, and never trap focus without an escape.
- Page transitions: none between tabs; a slide-in for pushed detail screens.

## Tokens (`apps/web/src/styles/tokens.css`, mapped into Tailwind v4 `@theme`)
- Surfaces: `--bg` (dark `#0c0f14`, light `#f7f8fa`), `--surface`, `--surface-2`, `--border`, `--fg`, `--fg-muted`.
- Accent: one brand hue used sparingly for the primary action and the energy ring. Default a saturated lime-green (`#7cf29a` dark / `#16a34a` light); revisit at naming time.
- Semantic macro colours, fixed everywhere: protein `#60a5fa` (blue), carbs `#fbbf24` (amber), fat `#f472b6` (pink), fibre `#34d399` (teal-green), water `#38bdf8` (sky).
- Status: `met` green, `close` amber, `short` neutral grey with an outline, `over` coral red. Status colours never double as macro colours.
- Type: system font stack (`-apple-system, Inter, Segoe UI, Roboto`) with `font-variant-numeric: tabular-nums` on every number. Scale: 12 / 14 / 16 / 20 / 28 / 44 (hero). Body 16 px minimum, which also stops iOS zooming inputs.
- Radius 16 px cards, 12 px controls, full for chips. Shadows only in light mode; dark mode uses surface steps.
- Spacing on a 4 px grid; screen gutter 16 px.
- Both themes defined on `:root` with `prefers-color-scheme` and a `data-theme` override from Settings.

## Components (`apps/web/src/components/ui/`)
Build these once in slice 1 and reuse: `AppShell`, `TabBar`, `Sheet`, `Button` (primary, secondary, ghost, destructive; 48 px tall), `IconButton`, `Card`, `Input` (with label, helper, error, right-slot unit), `NumberField` (`inputmode="decimal"`, unit suffix, stepper), `Select` (native on mobile, it is better than any custom one), `SegmentedControl`, `Toggle`, `Chip`, `ProgressBar` (macro bars), `Ring` (SVG, animated stroke), `StatTile`, `Skeleton`, `EmptyState`, `Toast`, `OfflineBanner`.
Feature screens live in `apps/web/src/features/<feature>/` and compose these; they don't write raw Tailwind for things a component covers.

## Screen states (every screen has all of them)
Loading = skeletons in the layout's shape, never a spinner in the middle. Empty = one sentence and one primary action. Error = what happened in plain words and a retry. Offline = a slim banner plus whatever cached data exists, with actions that need the network disabled and labelled.

## Forms for thumbs
- One question per screen in onboarding, big touch targets, the primary button pinned above the keyboard.
- Numeric entry uses `NumberField` with the unit visible and sensible steps (0.5 kg, 1 cm, 5 g).
- Native `<select>` and `<input type="date">` on mobile; they open the OS pickers people already know.
- Autofocus the first field on desktop only; on mobile the keyboard jumping up on load is disorienting.
- Validation inline, on blur, in words ("Weight should be between 30 and 300 kg").
- Never require a field whose label needs explaining; add helper text or drop the field.

## Motion
150 to 250 ms, ease-out. Rings and bars animate from 0 to value on first paint of a screen and from old to new value on updates. Sheets slide 250 ms. Respect `prefers-reduced-motion` by switching to instant. No bounce, no confetti except one tasteful moment when a day is met for the first time.

## Charts
Rings and bars are small hand-written SVG components with tokens for colour; no chart library for those. Line charts (weight trend in slice 5) use a tiny custom SVG too unless it gets painful, then `unovis` or `chart.js` via a decision. Before drawing any chart, load the `dataviz` skill for form and colour rules, then map its palette onto the tokens above rather than introducing new colours.

## Accessibility baseline
Touch targets 44 px minimum, colour never the only signal (status has an icon or text), contrast AA in both themes, every icon-only button has an `aria-label`, focus visible for keyboard users on desktop, `aria-live` on the quick-add result.

## Checklist before calling a screen done
Looks right at 360, 390 and 430 wide; dark and light; all four states; keyboard open doesn't hide the primary action; nothing overflows horizontally; numbers are tabular; safe areas respected on a notched device simulation.
