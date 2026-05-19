## 2024-05-15 - [Accessible Announcements & Focus Visibility]
**Learning:** In highly visual/interactive applications like this snowflake lab, transient actions (like copying a link) often lack non-visual feedback. Standard tooltips or toast notifications might not be sufficient for screen reader users if not properly announced.
**Action:** Implement a central `announce()` helper using an `aria-live="polite"` element for all transient UI feedback.

**Learning:** Dark-mode/Canvas-heavy interfaces often accidentally suppress default browser focus indicators, making keyboard navigation "blind."
**Action:** Explicitly define high-contrast `:focus-visible` styles for all interactive elements to ensure WCAG compliance and usability for keyboard-only users.
