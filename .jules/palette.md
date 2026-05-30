## 2025-01-24 - Robust Transient Feedback with Icon Swapping
**Learning:** When providing transient feedback for background actions (like 'Copied!' or 'Saved!'), swapping both the text and the icon provides a stronger visual affordance than text alone. Using a `Map` to store original label and icon states prevents "state-trap" bugs where rapid successive clicks could overwrite the stored "original" state with a temporary one.
**Action:** Use a centralized helper like `setTemporaryLabel(btnId, tempText, tempIcon, duration)` that tracks original states in a module-scoped `Map` to ensure robust restoration of the UI.

## 2025-01-24 - CSS Animation & Transform Conflicts
**Learning:** CSS keyframe animations that modify the `transform` property will overwrite any other `transform` styles (like hover scales) on the same element. This causes visual jitter or prevents hover states from working correctly. Additionally, infinite animations for "delight" should always respect user accessibility preferences.
**Action:** Avoid combining `transform` animations with separate `transform` hover effects on the same element; consider animating a parent/child instead. Always wrap infinite animations in `@media (prefers-reduced-motion: reduce)` blocks to ensure accessibility.
