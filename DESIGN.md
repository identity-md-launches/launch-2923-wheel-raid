# Wheel Raid design system

## Overview

Wheel Raid is a weekly boss game for Squeekchain’s community. Its visual idea is a quiet forest command center: an original, coarse-grid guardian in a moonlit grove, surrounded by restrained game controls. The wheel and the player’s daily action come before the rules and rewards.

The implemented interface is dark only. It uses warm off-white text, forest surfaces, lime actions and health, and amber rest indicators. No alternate theme is implemented. The raid, history and field guide share navigation, alignment edges, type and controls.

## Colors

Canonical tokens live in `src/styles.css:1`. Hue primitives feed semantic tokens; components use the semantic roles. Artwork colors are independent illustration colors in `src/lib/art.ts` and `src/components/Arena.tsx`.

| Semantic token | Resolved value | Use |
| --- | --- | --- |
| `--color-bg` | `#111713` | Page background |
| `--color-surface` | `#18201a` | Boss panel and dialogs |
| `--color-surface-raised` | `#1c251e` | Daily strike panel, notifications, guide aside |
| `--color-hover` | `#263229` | Neutral hover and empty health track |
| `--color-border` | `#344337` | Structural dividers and neutral control borders |
| `--color-text` | `#f1f0e6` | Main text |
| `--color-muted` | `#a4ae9e` | Descriptions, labels, secondary data |
| `--color-accent` | `#d5ed9f` | Primary action, health fill, focus and successful state |
| `--color-accent-hover` | `#e2f5ba` | Primary action hover |
| `--color-on-accent` | `#111713` | Text and icons on lime |
| `--color-rest` | `#e4bd7d` | Rest, streak and reward indicators |
| `--color-error` | `#f0a89c` | Recoverable errors |

Lime fills distinguish the main action from neutral secondary buttons. Its use on health and success represents game state; those states also have numeric or written labels. Amber rest always has a moon icon or explicit text.

Measured sRGB text contrast: main text/page 15.87:1, muted/page 7.90:1, muted/raised surface 6.85:1, primary text/lime 14.23:1, amber/surface 9.42:1 and error/raised surface 8.09:1. Chromium computed colors were checked against these values. The design probe checks resolved solid text backgrounds; it does not certify every illustration pixel.

## Typography

`--font` is `"DM Sans", Arial, sans-serif`. The local variable Latin font is `public/fonts/dm-sans-latin.woff2` (weight axis 100–1000); its SIL OFL notice is beside it. The interface uses **400, 500 and 700**. No italic style is requested. The local face loaded successfully in Chromium.

| Token | Size at a 16px root | Role |
| --- | --- | --- |
| `--text-xs` | 12px | Status, metadata, short hints and secondary descriptions |
| `--text-sm` | 14px | Default app copy, controls and table values |
| `--text-base` | 16px | Subheadings, guide prose and selected numeric values |
| `--text-lg` | 20px | Section headings and telemetry values |
| `--text-title` | 32px | Attack damage and narrow-screen page title |
| `--text-display` | 48px | Wide-screen page title |

Display headings use line-height 1.1 and tracking −0.05em; narrow titles use 1.15 / −0.04em. Section headings use 1.3 / −0.025em. Body line-height is 1.5, short explanatory copy 1.6, and long guide copy 1.7. Headings balance their wrapping, descriptions use pretty wrapping, and long guide text is limited to 70ch. Changing numbers use tabular numerals. Full wallet addresses in the account dialog wrap rather than clip. Short addresses link to the full explorer entry and expose the complete address in their title.

Generated SVG cards are independent 1200×630 artwork. They use Arial for portable rendering without a font fetch; their illustration typography is not an additional app UI scale.

## Layout

The shell is capped at 1328px including horizontal padding. Desktop header and page edges align with 40px insets. The spacing vocabulary is 4, 8, 12, 16, 20, 24, 32, 40 and 48px, declared as `--space-*`; component rules use values from that vocabulary. Most panels use 24px padding, and related text is separated by 4–8px.

The raid grid uses `minmax(0, 1fr) 350px` with a 24px gap. The boss owns the broad column; the daily action owns the narrow column. Below it, the telemetry strip gives shared wheel data a common baseline. The party log and rewards reuse the two-column relationship without nesting framed cards.

Implemented breakpoints:

- Above 1300px: 304px arena art and 28px attack-panel padding.
- At 1100px: page insets become 28px; sidebar 320px; archive rows and rules adapt.
- At 850px: insets become 24px; sidebar 290px; page title becomes 32px; telemetry wraps its status above three values.
- At 680px: navigation becomes a 44px-high mobile row; the raid becomes one column; guide and rewards stack; dialogs become bottom sheets. Header/page insets are 20px. The final mobile arena is 176px high, and the strike panel has 16px padding.
- At 360px: insets become 16px and the brand/secondary data adapt. Small health footnotes and log tools may wrap.

The last mobile overrides near the end of `src/styles.css` are intentional: they keep the daily action entirely on the first 390×844 screen. Its measured final button bounds are recorded in validation. Widths 320, 390, 768, 1024 and 1440px were checked in Chromium for raid and guide reflow. History, dialogs and card previews were also inspected at representative mobile/desktop widths. Native browser zoom and physical devices were not verified.

## Elevation & Depth

This is a flat interface with **no box shadows**. Border lines communicate structure; modest tonal differences group actions and secondary content. The arena scene carries the visual depth.

A native `<dialog>` uses an 80%-opaque near-black backdrop, top-layer modality, background scroll locking, and focus restoration. Notifications use one outlined surface at z-index 30. A 1px translucent white outline separates the card artwork from its surroundings.

## Shapes

`--radius-sm` is 6px for buttons and controls; `--radius` is 12px for main panels. Status tags and day squares use 4px. Dialogs use 16px, with only the top corners rounded in mobile bottom-sheet mode. The original SVG arena deliberately has hard pixel edges. Its cropping applies to art, not critical text.

## Components

| Component / pattern | Source | Behavior and reuse |
| --- | --- | --- |
| Main shell and navigation | `src/App.tsx`, `.site-header`, `.page`, `.mobile-nav` | Hash routes `#raid`, `#history`, `#guide`; current page indicated with text and underline. In-page fragments do not change views. A skip link reaches the main landmark. |
| Buttons | `.button`, `.primary`, `.icon-button`, `.text-button` in `src/styles.css` | Neutral secondary and lime primary variants. Primary daily action is 48px tall. Hover, pressed, focus, busy and disabled states are explicit. Icons use the label’s color. |
| Arena | `src/components/Arena.tsx`, `src/lib/art.ts` | Original SVG scenery and boss; props `resting` and `slain`. Rest gets written status and pixel sleep marks; defeat changes the illustration’s opacity. No perpetual animation. |
| Health | `.health-area`, `.health-bar` in `src/App.tsx` / CSS | Numeric HP and semantic progressbar. Unknown health has no numeric value. The label states that player contributions come from this log. A 500ms width transition is disabled for reduced motion. |
| Daily strike | `.attack-panel` in `src/App.tsx` | Connect → switch if necessary → sign in → sign attack. Power, attendance and UTC reset are visible. Pending/rejected/unavailable/completed states retain useful explanations. |
| Wallet sheet | `src/components/WalletSheet.tsx` | EIP-6963 named providers, generic browser fallback, Coinbase, and mobile wallet-browser links with bundled marks. A declined connection has an inline retryable error. |
| Dialog | `src/components/Dialog.tsx` | Shared title, single close button, Escape/backdrop close, native focus containment, scroll lock and trigger-focus return. 420px normal width; card variant 720px. |
| Party log | `.party-tools`, `.leaderboard-*` in `src/App.tsx` | Explicit device scope, signed-log import/export, empty state and stable damage/share columns. Duplicate imports do not add damage. |
| Errors | `ErrorNotice` in `src/App.tsx` | `role="alert"`, recoverable prose and dismiss action, located beside the failed attack or import. Long text wraps. Source outages have their own retry notice. |
| Raid card | `CardDialog`, `src/lib/card.ts` | Progress or victory artwork generated from observed raid data; SVG and PNG downloads; X share intent. The slayer roster and point status reflect the selected week. |

The outline icon set in `src/components/Icon.tsx` uses one 1.7px rounded stroke. Decorative icons are hidden from assistive technology; meaningful information also has text. Wallet marks preserve their vendor colors.

## Do’s and Don’ts

- Start an added view inside `.page`, reuse `.page-intro`, and add a hash navigation entry. Keep the main task before explanatory content.
- Use one filled primary action in each active surface. Put secondary actions in neutral buttons or recognizable links.
- Reuse the six text sizes, three weights and semantic color roles. Keep data tabular and critical strings reachable in full.
- Keep touch actions inset, preserve 2px visible focus rings, and use the shared native dialog for modal flows.
- Preserve the explicit data scope. Unknown readings are unknown; demo players, synthetic live counters and implied global persistence would conflict with this product.
- Keep status meaning redundant with text/icons. Honor reduced motion and forced-colors focus states.
- Preserve the forest art and flat surfaces; extra glow, shadow layers, unrelated gradients or nested card frames would introduce a competing visual system.

Design principles were informed by the pinned Better Interface guide (Jakub Krehel, MIT) and documentation method by Impeccable (Paul Bakaus, Apache-2.0). Full notices are retained in `artifacts/licenses/design-guidance.txt`. Review evidence and limitations are in `artifacts/validation.md`.
