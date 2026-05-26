## 2025-05-15 - Enhancing accessibility with ARIA live and shortcut hints
**Learning:** For single-page applications with transient actions like "Copy Link" or "Save File", a global ARIA live announcer is essential to provide non-visual feedback that mirrors visual state changes (like button label swaps).
**Action:** Always include a hidden `#a11y-announcer` and a helper `announce()` function when implementing features that provide visual-only feedback.

**Learning:** Power users appreciate keyboard shortcuts, but they are often "hidden" features. Appending shortcut keys to the `title` attribute of buttons is a low-effort, high-impact way to improve discoverability without cluttering the UI.
**Action:** Use the `(Key)` convention in button titles for all implemented keyboard shortcuts.

## 2025-05-15 - Dismissing overlays with Escape
**Learning:** Global key listeners for modal/overlay dismissal should handle focus carefully. Even if an input field within the overlay has focus, the 'Escape' key should still trigger the dismissal of the entire overlay to meet user expectations for standard modal behavior.
**Action:** Place 'Escape' dismissal logic before checks that block other shortcuts when an editable element is focused.

## 2025-05-15 - Centralized keyboard shortcut documentation
**Learning:** While `title` attributes are great for contextual hints, a centralized "Keyboard Shortcuts" list in a help or guide section provides a clear reference for users to learn all capabilities at once, especially for "hidden" shortcuts like `Esc` or `?`.
**Action:** Always include a dedicated shortcuts section in the primary documentation or help overlay of the application.

## 2025-05-15 - Robust Transient Feedback Logic
**Learning:** Simple `setTimeout` based label swapping (e.g., "Copy" -> "Copied!") is vulnerable to race conditions if clicked rapidly. The "original" label captured during the second click might be the "Copied!" text, leading to a permanent UI state error.
**Action:** Use a centralized helper with a `Map` to track and lock the true original label until the restoration cycle is complete.

## 2025-05-22 - Focus Management in Procedural Overlays
**Learning:** When toggling overlays in a procedural UI (like those using Tweakpane), manual focus management is critical. Simply showing an overlay isn't enough; focus must be programmatically moved to the first interactive element (or the container) and restored to the trigger button upon closing to maintain a logical tab order. For Tweakpane, targeting `.tp-dfwv input` is effective for getting focus into the generated controls.
**Action:** Implement a `lastActiveElement` pattern for all overlay toggles to ensure seamless keyboard navigation.
