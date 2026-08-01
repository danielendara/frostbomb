## 2026-10-18 - [Seed Persistence & Active Highlighting]
**Learning:** In procedural generation applications, refreshing can cause users to lose interesting variations. Storing and displaying a list of the last 5 seeds in `localStorage` provides an elegant history fallback. To prevent unnecessary layout thrashing or redundant DOM and storage writes, implement an early exit if the newly generated/selected seed is already at the top of the history list.
**Action:** When adding elements to persistent visual history slots, always validate their structures (e.g. via an alphanumeric regex) before dynamic insertion, run change-detection early exits to prevent thrashing, and dynamically show/hide the container to keep the layout uncluttered during modes like Lab Mode or Field Guide.

## 2026-10-19 - [Skip-to-Content / Bypass Blocks Pattern]
**Learning:** For interactive web applications with immersive 3D/canvas environments and persistent header banners, keyboard-only and screen reader users must navigate past multiple heavy components to reach the core settings block. Implementing a styled, keyboard-accessible "Skip to controls" bypass link as the first document child allows instant interaction.
**Action:** Always place skip links targeting critical interactive containers (with `tabindex="-1"`) at the very top of `<body>`. Style them so they remain hidden off-screen until receiving `focus-visible`, utilizing design system tokens for cohesive aesthetics.

## 2027-02-15 - [Dynamic Preview Live Region Management]
**Learning:** For dense interactive visualizations like the Nakaya Diagram canvas hover tracking, screen reader users can experience auditory overload if every high-frequency mouse hover triggers an ARIA live-region announcement. Setting `aria-live="off"` during pointermove / preview events, and restoring `aria-live="polite"` only upon a stable state or user selection, maintains visibility without keyboard/screen reader spam.
**Action:** Always suppress `aria-live` during live-preview/hover interactions and only re-enable it when the state stabilizes or on explicit user confirmation.

## 2027-02-16 - [Dynamic Seed Validation and Assistive Technology Sync]
**Learning:** In text inputs mapping directly to procedural seed values (such as Lab Mode custom seeds), user-entered validation failures should never silently fail or quietly revert. Instead, combining an explicit, spoken screen reader warning (`aria-live` announcement) with visual error badges on the main display ensures all users can identify and correct erroneous inputs seamlessly.
**Action:** Always pair custom procedural input validation checks with descriptive live-region announcements and temporary visual error cues rather than silent value rollbacks.

## 2027-02-17 - [Symmetric Panel Navigation and Keyboard Focus Restoration]
**Learning:** For interactive web applications with multiple deep/immersive overlay panes (e.g., Field Guide and Lab Mode), providing symmetrical "Close" actions inside both overlay panels significantly improves keyboard and mobile discoverability. When a panel is closed from its inner dismiss button, focus must be cleanly restored to its opening toggle while triggering appropriate visual/tactile press animations to avoid focus loss.
**Action:** When creating any toggleable panel or overlay, always place a visible "Close" button inside the panel (especially for mobile/scroll containment), and restore focus to the trigger element on close.

## 2027-02-18 - [Granular Action Controls and Grid Symmetry]
**Learning:** For complex procedural or seeded random applications, copy-to-clipboard behaviors often conflate complete URLs with raw configuration strings (like seeds). Providing a secondary, dedicated "Copy Seed only" button alongside the full "Copy Link" action provides precise control for power users while maintaining layout balance (an even button count) on mobile grid layouts.
**Action:** Provide dedicated, granular buttons with explicit ARIA descriptions and temporary "Copied!" status visual badges for distinct export behaviors, ensuring they gracefully adapt to responsive action grids.

## 2027-02-19 - [Sub-menu Arrow-Key List Navigation and Focus Wrapping]
**Learning:** For lists of interactive controls inside dense visual environments (like recent seed history list slots), tab-key navigation alone can feel tedious and break natural keyboard layouts. Implementing custom Arrow key navigation (ArrowRight/ArrowDown to move forward, ArrowLeft/ArrowUp to move backward) with wrapping, combined with event propagation interception to prevent side effects on global keyboard shortcuts (like camera rotation), delivers an incredibly fluid and accessible experience.
**Action:** When designing nested lists of compact visual buttons, always implement bidirectional arrow-key selection with seamless index wrapping, while explicitly stopping keyboard event bubbling to protect parent controls.

## 2027-10-25 - [Dynamic Media Query Sync / Disabled Button ARIA]
**Learning:** When interactive controls are dynamically disabled based on persistent system preferences (like the auto-rotate button under `prefers-reduced-motion`), screen reader and keyboard-only users need explicit context on why the control cannot be interacted with. Syncing the media query state to set a explanatory `aria-label` (and removing it when not active) prevents confusion.
**Action:** Always pair disabled elements matching system media query overrides with an explicit, descriptive `aria-label` to convey the exact context to assistive technologies.
