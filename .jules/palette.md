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

## 2025-01-24 - Reliable ARIA Live Region Updates
**Learning:** Screen readers often ignore successive identical announcements in a live region. To ensure every action is announced (e.g., clicking 'Refresh' multiple times), the region's content must be cleared and potentially toggled with `aria-hidden` before setting the new message.
**Action:** In the `announce` helper, clear `textContent`, set `aria-hidden="true"`, and use a short `setTimeout` (e.g., 50ms) to restore `aria-hidden` and set the new message.

## 2025-01-24 - State Persistence during Temporary UI Messages
**Learning:** When a button shows a temporary "Success!" message, background data updates (like a new seed being generated) can be lost if the UI simply restores to the *old* state it captured when the message started.
**Action:** Update the `setText` utility to check if an element is currently in a "temporary" state. If so, update the *stored* original value instead of the live DOM text, ensuring the correct data is shown when the temporary message expires.

## 2025-01-24 - Progressive Enhancement for Clipboard Operations
**Learning:** `navigator.clipboard` is only available in secure contexts (HTTPS) and newer browsers. Relying on it exclusively can break core features like "Copy Link" in some environments.
**Action:** Use a cascading fallback for clipboard operations: `navigator.clipboard` -> `document.execCommand('copy')` -> `window.prompt`. This ensures users always have a way to retrieve the content, even if the automatic copy fails.
