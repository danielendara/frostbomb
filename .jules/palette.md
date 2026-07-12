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
