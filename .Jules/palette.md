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
