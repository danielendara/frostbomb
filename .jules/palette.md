# Palette's UX Journal

## 2025-05-15 - Improving Accessibility and Discoverability

**Learning:** Transient visual feedback (like a "Copied!" message) is often inaccessible to screen reader users. Implementing a hidden ARIA live region (`aria-live="polite"`) allows these status updates to be announced without disrupting the user's focus. Additionally, documenting keyboard shortcuts directly in button tooltips (title attribute) significantly improves discoverability for power users in a "laboratory" style interface.

**Action:** Always include an ARIA live announcer for async feedback actions and append shortcut hints to interactive element tooltips when keyboard overrides are present.
