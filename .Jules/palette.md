## 2025-01-24 - Accessible UI Transitions
**Learning:** Using `opacity: 0` alone to hide UI elements (like in a "Photo Mode") is insufficient for accessibility as the elements remain in the tab order. Combining `opacity` with `visibility: hidden` and including `visibility` in the `transition` property ensures elements are removed from the accessibility tree when the animation completes, preventing "phantom" keyboard focus.
**Action:** Always pair `opacity` transitions with `visibility` for UI hiding utilities to maintain accessible focus management.

## 2025-01-24 - Interactive Diagram Semantics
**Learning:** Interactive <canvas> elements that trigger state changes (like the Nakaya Diagram) require explicit ARIA attributes (`aria-expanded`, `aria-pressed`, `aria-controls`) to communicate their current state and relationship to other UI components to screen reader users.
**Action:** Synchronize ARIA attributes in JavaScript whenever a canvas interaction modifies the global application state.
