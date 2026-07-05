## 2025-01-24 - Accessible UI Transitions
**Learning:** Using `opacity: 0` alone to hide UI elements (like in a "Photo Mode") is insufficient for accessibility as the elements remain in the tab order. Combining `opacity` with `visibility: hidden` and including `visibility` in the `transition` property ensures elements are removed from the accessibility tree when the animation completes, preventing "phantom" keyboard focus.
**Action:** Always pair `opacity` transitions with `visibility` for UI hiding utilities to maintain accessible focus management.

## 2025-01-24 - Interactive Diagram Semantics
**Learning:** Interactive <canvas> elements that trigger state changes (like the Nakaya Diagram) require explicit ARIA attributes (`aria-expanded`, `aria-pressed`, `aria-controls`) to communicate their current state and relationship to other UI components to screen reader users.
**Action:** Synchronize ARIA attributes in JavaScript whenever a canvas interaction modifies the global application state.

## 2025-01-24 - Tooltip Affordances and Semantic Keys
**Learning:** Native `title` tooltips on descriptive labels (e.g., Growth Conditions) are often overlooked. Adding a `dotted underline` affordance successfully signals interactivity/hidden info without cluttering the UI. Additionally, `<kbd>` tags provide essential semantic context for keyboard-driven simulations compared to plain text.
**Action:** Apply `text-decoration: underline dotted` to labels with non-critical "hint" tooltips to aid discovery.

## 2025-01-24 - Linked Discovery Patterns
**Learning:** Connecting complex data points (like simulation stats) to their educational definitions (the Field Guide) via interactive "jumps" significantly improves domain-specific discoverability. For non-semantic interactive rows, using `role="button"`, `tabindex="0"`, and `requestAnimationFrame` before `scrollIntoView` ensures a smooth, accessible transition even when the target container's visibility is being toggled simultaneously.
**Action:** Use interactive labels to bridge the gap between abstract data and documentation, ensuring proper ARIA roles and layout-aware scrolling.

## 2025-05-15 - Keyboard Focus and Visual Synchronicity
**Learning:** When using `role="button"` on non-semantic elements (like `div` or `span`) for dense data displays, native browser focus outlines are often omitted. Explicitly adding `focus-visible` styles ensures keyboard users can track their position in high-density metadata views.
**Action:** Always verify that custom `role="button"` elements have a `:focus-visible` or `:focus` outline defined in the design system.

## 2025-05-15 - Global Shortcut Feedback
**Learning:** For global keyboard shortcuts like `Escape` that trigger UI actions (e.g., closing a modal), adding a brief CSS transition (like a "press" or "glow") to the corresponding physical button provides essential visual feedback that the keyboard command was successfully received and mapped to the UI element.
**Action:** Hook into global keydown events to briefly apply an active/pressed class to the associated UI toggle for accessibility and polish.
