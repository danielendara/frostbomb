## 2025-05-15 - [Dynamic Classification Feedback]
**Learning:** In interactive parameter-tuning interfaces (like Lab Mode), users need immediate confirmation when their manual adjustments cross a logical threshold (e.g., a new growth habit). Standardizing visual feedback (animations) across both automated and manual state changes prevents "silent" classification updates.
**Action:** Always trigger highlight animations on classification labels when the underlying logic resolves to a new state, regardless of whether the update was part of an 'animated' sequence or a manual user interaction.

## 2026-07-15 - [Dynamic Accessibility Preference Sync]
**Learning:** When responding to system-level accessibility preferences like `prefers-reduced-motion`, UI elements must not only provide visual and ARIA feedback (disabling buttons, updating tooltips) but must also explicitly halt any active background logic. Failing to do so can create a "trapped state" where a feature (like auto-rotation) continues without the user being able to stop it via the now-disabled UI.
**Action:** In media query listeners, ensure that background logic is synchronized with the new UI state (e.g., call `scene.stop()` if the button is being disabled due to reduced motion).

## 2024-05-24 - [Visual Feedback for Static Actions]
**Learning:** For actions that don't have a visible UI state change (like saving a file or copying to clipboard), a brief "camera flash" or highlight overlay provides satisfying, immediate confirmation. This is especially useful in immersive/fullscreen apps where standard browser notifications might be missed or feel disjointed.
**Action:** Implement a .flash-overlay with pointer-events: none and respect prefers-reduced-motion to provide non-obstructive success feedback for static actions.

## 2026-08-15 - [Procedural Control Exploration and Accessibility]
**Learning:** In procedural generation UI control panels (like Tweakpane), providing an explicit randomization button alongside the seed input drastically increases user discoverability and ease of exploration. For complete UX, the randomization must preserve the user's other customized parameters, synchronize with the browser address bar (URL query parameters) to retain shareability, and immediately announce the newly selected seed to assistive technologies (via ARIA live regions) so keyboard/screen-reader users are not left guessing what state was generated.
**Action:** When adding randomized parameters to complex control panels, always bind state synchronization to the browser history/URL and trigger programmatic screen-reader announcements on state change.
