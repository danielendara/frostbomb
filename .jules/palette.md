## 2025-05-15 - Enhancing accessibility with ARIA live and shortcut hints
**Learning:** For single-page applications with transient actions like "Copy Link" or "Save File", a global ARIA live announcer is essential to provide non-visual feedback that mirrors visual state changes (like button label swaps).
**Action:** Always include a hidden `#a11y-announcer` and a helper `announce()` function when implementing features that provide visual-only feedback.

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

## 2026-06-15 - Multi-modal Feedback and Fallback Reliability
**Learning:** For critical "action successful" indicators (like Copy or Save), swapping both the button text AND the icon (e.g., to a checkmark) provides stronger visual confirmation across varying screen sizes and contexts. Additionally, providing UI feedback *before* or independently of browser API results (like the Clipboard API) ensures the interface remains responsive even in restrictive environments (headless, non-secure contexts) where the API might silently fail.
**Action:** Use a unified `setTemporaryLabel` helper that manages both text and icon state for multi-modal confirmation. Always trigger visual feedback on action attempt, with error-specific overrides if the action fails, to maintain perceived performance.
