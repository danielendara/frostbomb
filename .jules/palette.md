## 2025-05-15 - Enhancing accessibility with ARIA live and shortcut hints
**Learning:** For single-page applications with transient actions like "Copy Link" or "Save File", a global ARIA live announcer is essential to provide non-visual feedback that mirrors visual state changes (like button label swaps).
**Action:** Always include a hidden `#a11y-announcer` and a helper `announce()` function when implementing features that provide visual-only feedback.

**Learning:** Power users appreciate keyboard shortcuts, but they are often "hidden" features. Appending shortcut keys to the `title` attribute of buttons is a low-effort, high-impact way to improve discoverability without cluttering the UI.
**Action:** Use the `(Key)` convention in button titles for all implemented keyboard shortcuts.

## 2025-05-15 - Dismissing overlays with Escape
**Learning:** Global key listeners for modal/overlay dismissal should handle focus carefully. Even if an input field within the overlay has focus, the 'Escape' key should still trigger the dismissal of the entire overlay to meet user expectations for standard modal behavior.
**Action:** Place 'Escape' dismissal logic before checks that block other shortcuts when an editable element is focused.
