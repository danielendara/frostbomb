## 2025-05-15 - [Screen Reader Feedback]
**Learning:** Screen reader users need explicit confirmation for state changes (like "Link copied").
**Action:** Use an 'announce()' helper with aria-live="polite".

## 2025-05-16 - [Keyboard Shortcut Hints]
**Learning:** Hidden keyboard shortcuts should be hinted in 'title' attributes to improve discoverability.
**Action:** Append shortcut keys in parentheses to button titles (e.g. "Regrow (R)").

## 2025-05-20 - [Aria Disclosure vs. Toggle]
**Learning:** Buttons that show/hide content panels should use `aria-expanded` (disclosure pattern) rather than `aria-pressed` (toggle button pattern) to clearly communicate the effect on content visibility to screen readers.
**Action:** Use `aria-expanded` and `aria-controls` for panels like "Field Guide" or "Lab Mode".
