## 2025-01-24 - Accessible UI Transitions
**Learning:** Using `opacity: 0` alone to hide UI elements (like in a "Photo Mode") is insufficient for accessibility as the elements remain in the tab order. Combining `opacity` with `visibility: hidden` and including `visibility` in the `transition` property ensures elements are removed from the accessibility tree when the animation completes, preventing "phantom" keyboard focus.
**Action:** Always pair `opacity` transitions with `visibility` for UI hiding utilities to maintain accessible focus management.

**Learning:** Power users appreciate keyboard shortcuts, but they are often "hidden" features. Appending shortcut keys to the `title` attribute of buttons is a low-effort, high-impact way to improve discoverability without cluttering the UI.
**Action:** Use the `(Key)` convention in button titles for all implemented keyboard shortcuts.

## 2025-05-15 - Dismissing overlays with Escape
**Learning:** Global key listeners for modal/overlay dismissal should handle focus carefully. Even if an input field within the overlay has focus, the 'Escape' key should still trigger the dismissal of the entire overlay to meet user expectations for standard modal behavior.
**Action:** Place 'Escape' dismissal logic before checks that block other shortcuts when an editable element is focused.

## 2026-06-11 - Bridging the Keyboard Feedback Gap
**Learning:** Keyboard shortcuts often feel "disconnected" because they lack the tactile visual feedback (active states, scale changes) of mouse clicks. Bridging this gap by programmatically triggering "press" animations for keyboard actions creates a more unified and responsive-feeling interface.
**Action:** Route both keyboard and mouse events through unified handlers that trigger the same visual feedback logic. Use a dedicated CSS class (e.g., .btn-press) and a JS helper that forces a reflow to allow immediate re-triggering of one-shot animations.

## 2025-05-15 - Centralized keyboard shortcut documentation
**Learning:** While `title` attributes are great for contextual hints, a centralized "Keyboard Shortcuts" list in a help or guide section provides a clear reference for users to learn all capabilities at once, especially for "hidden" shortcuts like `Esc` or `?`.
**Action:** Always include a dedicated shortcuts section in the primary documentation or help overlay of the application.

## 2026-06-11 - Modal Focus Parity
**Learning:** For users navigating via screen readers or keyboards, a modal or overlay is "invisible" unless focus is explicitly moved into it upon opening. Returning focus to the original trigger upon closing is equally critical to prevent the user from losing their place in the DOM.
**Action:** Implement programmatic `.focus()` calls on modal containers (with `tabindex="-1"`) and store the last-focused element to restore it on dismissal.

## 2025-01-24 - Interactive Diagram Semantics
**Learning:** Interactive <canvas> elements that trigger state changes (like the Nakaya Diagram) require explicit ARIA attributes (`aria-expanded`, `aria-pressed`, `aria-controls`) to communicate their current state and relationship to other UI components to screen reader users.
**Action:** Synchronize ARIA attributes in JavaScript whenever a canvas interaction modifies the global application state.

## 2025-05-14 - Visual Anchoring with Existing Design Tokens
**Learning:** When providing visual feedback for programmatic state changes (like regrowing a snowflake), using existing design tokens (e.g., a `.section-highlight` class) maintains aesthetic consistency while providing immediate focus anchoring. This avoids bloating the CSS with one-off animation classes while still meeting the user's need for interactive confirmation.
**Action:** Prioritize existing highlight or pulse utility classes for micro-interaction feedback before creating new CSS.

## 2025-05-15 - Focus Management in UI Transitions
**Learning:** When navigating via programmatic jumps or toggling immersive modes (like a "Photo Mode"), keyboard focus is often lost to the `<body>` element. This breaks the navigation flow for screen reader and keyboard-only users. Furthermore, restoring focus immediately after a visibility change can fail if the element hasn't been fully painted or transitioned into a focusable state.
**Action:** Always implement explicit focus restoration for overlays and immersive modes. Use `requestAnimationFrame` or a small `setTimeout` (50ms) to ensure the target element is visible and focusable before calling `.focus()`. For jump links, ensure target sections have `tabindex="-1"` to be programmatically focusable.

## 2025-01-24 - Immersive Mode Discoverability & Exit
**Learning:** Immersive or "Photo" modes that hide the UI solely via keyboard shortcuts are inaccessible to touch-only users and suffer from low discoverability. Providing a visible toggle and an intuitive exit strategy (like clicking the main canvas) ensures the feature is accessible across all devices and easy to escape if accidentally triggered.
**Action:** Always include a visible UI toggle for immersive modes and implement a "click-to-restore" handler on the primary content area.

## 2025-01-24 - Multi-modal State Feedback
**Learning:** When a keyboard shortcut (e.g., 'H') triggers a functional state change, users benefit from visual confirmation that matches the mouse-driven interaction. Programmatically triggering the "active" or "pressed" visual state on the corresponding UI button reinforces the mental model of the shortcut's function.
**Action:** Use a unified visual feedback function (e.g., `visualPress`) that can be called by both keyboard and click listeners.

## 2026-06-11 - Semantic Shortcut Navigation
**Learning:** Keyboard shortcuts like `?` are most effective when they provide immediate, contextual access to the information requested. Transporting the user to a general "Guide" is helpful, but navigating and focusing the specific "Shortcuts" section within that guide significantly reduces cognitive load and improves accessibility.
**Action:** Use programmatic focus management (`tabindex="-1"` + `.focus()`) and visual anchoring (highlights/animations) when jumping to specific sections from global keyboard shortcuts.

## 2027-02-14 - Power-user Canvas Navigation
**Learning:** For complex, canvas-based interactive diagrams (like the Nakaya Diagram), mouse-driven interaction can be imprecise or inaccessible. Mapping semantic keys like `Home`/`End` (to boundaries) and `PageUp`/`PageDown` (to large-percentage jumps) provides an efficient, accessible alternative for parameter manipulation that mirrors standard document navigation expectations.
**Action:** Always provide "jump" keyboard shortcuts for interactive diagrams that allow users to reach boundary states or make large, predictable adjustments to parameters.

## 2026-10-19 - [Skip-to-Content / Bypass Blocks Pattern]
**Learning:** For interactive web applications with immersive 3D/canvas environments and persistent header banners, keyboard-only and screen reader users must navigate past multiple heavy components to reach the core settings block. Implementing a styled, keyboard-accessible "Skip to controls" bypass link as the first document child allows instant interaction.
**Action:** Always place skip links targeting critical interactive containers (with `tabindex="-1"`) at the very top of `<body>`. Style them so they remain hidden off-screen until receiving `focus-visible`, utilizing design system tokens for cohesive aesthetics.

## 2027-02-15 - Dynamic Preview Live Region Management
**Learning:** For dense interactive visualizations like the Nakaya Diagram canvas hover tracking, screen reader users can experience auditory overload if every high-frequency mouse hover triggers an ARIA live-region announcement. Setting `aria-live="off"` during pointermove / preview events, and restoring `aria-live="polite"` only upon a stable state or user selection, maintains visibility without keyboard/screen reader spam.
**Action:** Always suppress `aria-live` during live-preview/hover interactions and only re-enable it when the state stabilizes or on explicit user confirmation.

## 2027-10-23 - Intercepted Scroll Keys in Overlays
**Learning:** Global keydown handlers (e.g., using `Space` or `PageDown` as triggers) can inadvertently block native browser accessibility and reading tools. When an overlay, guide, or modal is open, global shortcuts must be carefully gated or disabled so that keyboard users can scroll and read the overlay text without triggering unintended background actions.
**Action:** Always check the visibility or open state of active overlays/modals before allowing non-modified keys (like `Space`) to trigger global state-changing actions.

## 2027-10-24 - [Non-destructive History Purging]
**Learning:** Destructive actions like clearing history or lists can be frustrating if done accidentally. Providing a temporary inline "Undo" flow in place of the list, styled as a standard interactive element with custom hover/focus states, keeps the action non-destructive, provides clear accessibility feedback, and preserves visual balance.
**Action:** Always implement a temporary inline undo option with a timeout (e.g. 10s) and programmatic focus management when providing history clearance features.

## 2027-10-25 - [Dynamic Media Query Sync / Disabled Button ARIA]
**Learning:** When interactive controls are dynamically disabled based on persistent system preferences (like the auto-rotate button under `prefers-reduced-motion`), screen reader and keyboard-only users need explicit context on why the control cannot be interacted with. Syncing the media query state to set a explanatory `aria-label` (and removing it when not active) prevents confusion.
**Action:** Always pair disabled elements matching system media query overrides with an explicit, descriptive `aria-label` to convey the exact context to assistive technologies.

## 2027-10-26 - [Immersive Panel Focus Management]
**Learning:** When activating an immersive, hidden manual control container (such as the `#lab-controls` panel), assigning `tabindex="-1"`, `role="region"`, and an explicit `aria-label` to the container and programmatically focusing it inside a `requestAnimationFrame` callback ensures keyboard and screen-reader users are immediately routed into the newly revealed controls once painted.
**Action:** Always programmatically move focus to a newly revealed container panel on toggle to prevent keyboard navigation from being trapped or lost.

## 2027-10-27 - [Static ARIA-Label with Dynamic Tooltip for Toggle Buttons]
**Learning:** When buttons utilize `aria-pressed` to convey binary toggled state, maintaining a static `aria-label` attribute (e.g. 'Pink Mode (P)') avoids redundant screen reader announcements, while concurrently updating the native `title` attribute (e.g. 'Toggle pink mode (P) - current: active') provides mouse-hover users with updated state guidance.
**Action:** Pair static `aria-label` attributes on `aria-pressed` buttons with dynamic tooltip `title` text updates for clean accessibility and tooltips.

## 2027-10-28 - [Keyboard Shortcut Badges without Screen Reader Clutter]
**Learning:** Adding physical keycap badges (using `<kbd>` elements) inside action buttons makes keyboard shortcuts highly discoverable for desktop users. However, because the shortcut info is already provided via the button's accessible name, `title`, or `aria-keyshortcuts`, these nested visual elements should be marked with `aria-hidden="true"` to prevent screen readers from announcing redundant or confusing characters (e.g., reading "Reset V" instead of "Reset").
**Action:** When nesting keyboard shortcut badges within buttons, wrap them in a `<kbd>` element with `aria-hidden="true"` and apply responsive styles to hide them on touch-only/mobile devices where shortcuts are irrelevant.

## 2027-11-01 - [Direct Dynamic Visual Feedback on GUI Validation Failures]
**Learning:** Third-party GUI libraries (like Tweakpane) handle invalid inputs by silently reverting back to the last valid state without any visual alerts on the text input element itself. When custom input validation is intercepted, programmatically querying the input DOM element and applying temporary high-contrast visual cues bridges the feedback gap.
**Action:** On custom input validation failures within third-party widgets, manually query the underlying input elements to apply and cleanly tear down temporary warning styles in synchrony with screen reader live region announcements.

## 2027-11-02 - Crosshair Alignment Guides on Canvas Hover
**Learning:** Adding dotted horizontal and vertical axis-alignment guides along with a small preview dot on coordinate diagram canvases (such as the Nakaya Diagram) during high-frequency 'pointermove' events—and clearing them on 'pointerleave'—provides immediate, intuitive spatial tracking and numerical context without cluttering the persistent visualization path.
**Action:** Integrate dotted crosshair alignment guides and a temporary preview dot on coordinate diagram canvases on mouse hover, and cleanly reset/re-render the background once mouse is removed.

## 2027-11-03 - Keyboard-Driven Canvas Alignment Guides
**Learning:** Adding mouse-hover interaction guides to highly visual canvases is excellent, but keyboard-only users who focus and navigate the canvas using keyboard shortcuts miss out on that visual scaffolding. Bridging the gap by rendering the same alignment guides when the canvas is keyboard-focused or undergoing keyboard navigation ensures functional parity and high visual clarity.
**Action:** Bind canvas `focus`/`blur` listeners to trigger crosshair guides at the current active coordinates, and ensure rendering loops preserve these guides if keyboard focus is maintained during `pointerleave` events.

## 2027-11-04 - Dynamic ARIA and Tooltip Synchronization on Transient Button States
**Learning:** When buttons update their visible text to convey transient visual feedback (e.g., 'Copied!', 'Saving...', 'Reset!'), screen reader and mouse-hover users do not receive this feedback unless the `aria-label` and native `title` (tooltip) are also synchronized temporarily and restored cleanly.
**Action:** Always capture and cache existing `aria-label` and `title` attributes into custom data-attributes, apply the transient state feedback to them, and restore them upon feedback expiration. If underlying data changes while a button is in a transient feedback state (such as seed changes), update the cached data-attributes to prevent restoring stale or incorrect information.

## 2027-11-05 - Dynamic ARIA-Expanded and Controls on Navigation Triggers
**Learning:** When interactive elements (such as stat summary cards or field note rows) act as trigger buttons that jump to and open specific accordion/guide sections elsewhere in the document, pairing explicit `aria-controls` with dynamic `aria-expanded` attributes provides critical spatial and state context to screen readers.
**Action:** On jump/navigation buttons that open or expand target sections, set `aria-controls` to the section ID and synchronize `aria-expanded` ("true"/"false") dynamically whenever the target section is toggled or dismissed.


