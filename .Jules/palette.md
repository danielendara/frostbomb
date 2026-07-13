## 2024-05-24 - Unified Tactile Feedback for Multi-modal Inputs

**Learning:** When an application provides programmatic animations (like a "pop" or "press" effect) for keyboard shortcuts, it is essential to bridge that same feedback to mouse and touch interactions. Standardizing on a single utility that handles both DOM elements and IDs ensures that the mental model of the interaction remains consistent across all input types (keyboard, mouse, touch).

**Action:** Create a flexible `visualPress` or `animateClick` utility that can be easily dropped into both keyboard listeners and mouse/touch event handlers. Use `void element.offsetWidth` to reliably restart CSS animations in high-frequency interaction scenarios.

## 2025-05-14 - [Synchronized Rhythmic Animations]
**Learning:** Desynchronized CSS animations on multiple elements sharing a thematic state (e.g., "Prism Mode") create cognitive friction. Slower, unified cycles (10s) reduce visual noise while maintaining the "delight" factor.
**Action:** Align multi-element theme animations to a single duration and timing function.

## 2025-05-14 - [Decoupling Logic from Style for Accessibility]
**Learning:** Injecting colors directly via JS (e.g., `.style.color = 'green'`) makes it harder to manage high-contrast modes and accessible state representation. Driving styles via semantic attributes like `aria-pressed` in CSS centralizes accessibility and design logic.
**Action:** Use JS to update ARIA attributes and ARIA live regions; use CSS to respond to those attribute changes for visual styling.
