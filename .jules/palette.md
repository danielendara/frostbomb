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

## 2026-06-18 - Interactive Diagrams as Control Surfaces
**Learning:** Static informative diagrams (like the Nakaya morphology chart) are missed opportunities for intuitive control. Making them interactive by mapping spatial coordinates back to simulation parameters (e.g., Temperature and Supersaturation) creates a "Lab Mode" that is more discoverable and satisfying than traditional sliders.
**Action:** When a visualization explains the "why" of a simulation, try to make it the interface for the "how". Ensure these interactions support touch and mouse (pointer events), and crucially, provide keyboard support for ARIA-labeled interactive surfaces.

## 2026-06-18 - Accessible Canvas Interaction Hygiene
**Learning:** Providing keyboard navigation for canvas-based controls (like X/Y parameter diagrams) requires strict event management to avoid UX regressions. Specifically: 1) `preventDefault()` is mandatory for arrow keys to block unintended page scrolling; 2) ARIA live announcements must be throttled/discrete (e.g., only on keypress, not fluid mouse drag) to avoid screen reader "spam"; 3) Focus indicators (e.g., `focus-visible`) must be explicitly styled for custom interactive elements to meet WCAG success criteria.
**Action:** Use a `shouldAnnounce` flag in update handlers to separate fluid input state changes from discrete user-intent announcements. Always wrap keyboard interaction logic in `preventDefault()` and `stopPropagation()` when the interactive component has focus.

## 2026-06-25 - Focus Restoration for Accessibility
**Learning:** Closing overlays or modals without explicitly returning focus to the triggering element leaves keyboard users in a "null" state, often forcing them to tab through the entire page again. This is especially disruptive in apps with many global shortcuts.
**Action:** Always explicitly `.focus()` the triggering button when closing an overlay to maintain logical tab order.

## 2026-06-25 - Contextual 3D Canvas Labeling
**Learning:** For procedural generators, a static `aria-label` like "3D Scene" is unhelpful. Updating the label dynamically to include the generated object's attributes (e.g., crystal habit and seed) provides immediate context to screen reader users that their action was successful.
**Action:** Update the visualization's `aria-label` dynamically whenever the procedural content changes.

## 2026-06-25 - Bridging Async Latency with Loading Announcements
**Learning:** When a UI component loads asynchronously (e.g., Lab Mode controls), "silent" latency can make the interface seem unresponsive. Providing a visual "LOADING..." state paired with an ARIA live announcement prevents user confusion during the transition.
**Action:** Implement visual status indicators and `announce()` calls during the `await` period of dynamic imports or heavy initialization.
