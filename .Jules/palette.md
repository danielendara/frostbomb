## 2026-10-18 - [Seed Persistence & Active Highlighting]
**Learning:** In procedural generation applications, refreshing can cause users to lose interesting variations. Storing and displaying a list of the last 5 seeds in `localStorage` provides an elegant history fallback. To prevent unnecessary layout thrashing or redundant DOM and storage writes, implement an early exit if the newly generated/selected seed is already at the top of the history list.
**Action:** When adding elements to persistent visual history slots, always validate their structures (e.g. via an alphanumeric regex) before dynamic insertion, run change-detection early exits to prevent thrashing, and dynamically show/hide the container to keep the layout uncluttered during modes like Lab Mode or Field Guide.

## 2026-10-19 - [Skip-to-Content / Bypass Blocks Pattern]
**Learning:** For interactive web applications with immersive 3D/canvas environments and persistent header banners, keyboard-only and screen reader users must navigate past multiple heavy components to reach the core settings block. Implementing a styled, keyboard-accessible "Skip to controls" bypass link as the first document child allows instant interaction.
**Action:** Always place skip links targeting critical interactive containers (with `tabindex="-1"`) at the very top of `<body>`. Style them so they remain hidden off-screen until receiving `focus-visible`, utilizing design system tokens for cohesive aesthetics.

## 2027-02-15 - [Dynamic Preview Live Region Management]
**Learning:** For dense interactive visualizations like the Nakaya Diagram canvas hover tracking, screen reader users can experience auditory overload if every high-frequency mouse hover triggers an ARIA live-region announcement. Setting `aria-live="off"` during pointermove / preview events, and restoring `aria-live="polite"` only upon a stable state or user selection, maintains visibility without keyboard/screen reader spam.
**Action:** Always suppress `aria-live` during live-preview/hover interactions and only re-enable it when the state stabilizes or on explicit user confirmation.
