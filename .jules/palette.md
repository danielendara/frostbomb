## 2025-01-24 - Robust Transient Feedback with Icon Swapping
**Learning:** When providing transient feedback for background actions (like 'Copied!' or 'Saved!'), swapping both the text and the icon provides a stronger visual affordance than text alone. Using a `Map` to store original label and icon states prevents "state-trap" bugs where rapid successive clicks could overwrite the stored "original" state with a temporary one.
**Action:** Use a centralized helper like `setTemporaryLabel(btnId, tempText, tempIcon, duration)` that tracks original states in a module-scoped `Map` to ensure robust restoration of the UI.

## 2025-01-24 - CSS Animation & Transform Conflicts
**Learning:** CSS keyframe animations that modify the `transform` property will overwrite any other `transform` styles (like hover scales) on the same element. This causes visual jitter or prevents hover states from working correctly. Additionally, infinite animations for "delight" should always respect user accessibility preferences.
**Action:** Avoid combining `transform` animations with separate `transform` hover effects on the same element; consider animating a parent/child instead. Always wrap infinite animations in `@media (prefers-reduced-motion: reduce)` blocks to ensure accessibility.

## 2025-01-24 - Accessibility for Procedural Visualizations
**Learning:** Highly dynamic or procedural content (like a generated snowflake) is often invisible to screen readers. By mapping the internal state (e.g., the current "habit" or crystal type) to a descriptive `aria-label` on the canvas element and updating it in real-time, the interface becomes significantly more inclusive for users who cannot see the generated art.
**Action:** Always identify a semantic description for procedurally generated visuals and update an `aria-label` or `aria-description` whenever the visual state changes.

## 2025-01-24 - Enhancing Clipboard Feedback with ARIA Live Regions
**Learning:** For background actions like "Copy to Clipboard", visual-only feedback (like a button text change) is insufficient for screen reader users. Using an `aria-live="polite"` region to announce the action completion provides much better accessibility. Additionally, including the specific content being copied (e.g., the seed value) in the announcement provides extra context and reassurance.
**Action:** Use an ARIA live region (e.g., `#a11y-announcer`) for transient feedback. Ensure the announcement includes specific context (like "Seed [value] copied") rather than just a generic "Copied".

## 2026-06-11 - Bridging the Keyboard Feedback Gap
**Learning:** Keyboard shortcuts often feel "disconnected" because they lack the tactile visual feedback (active states, scale changes) of mouse clicks. Bridging this gap by programmatically triggering "press" animations for keyboard actions creates a more unified and responsive-feeling interface.
**Action:** Route both keyboard and mouse events through unified handlers that trigger the same visual feedback logic. Use a dedicated CSS class (e.g., .btn-press) and a JS helper that forces a reflow to allow immediate re-triggering of one-shot animations.
