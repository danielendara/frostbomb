## 2026-06-11 - Physicality of Digital Shortcuts
**Learning:** UX for global keyboard shortcuts is significantly improved when the interface provides "physical" visual feedback (e.g., button pops or brand animations) that mirrors the action. This bridges the feedback gap for users not using a mouse and reinforces the mental mapping between keys and UI elements.
**Action:** When implementing global shortcuts, always ensure a corresponding UI element exists and triggers a tactile animation (like `animate-pop`) upon activation.

## 2026-06-11 - Contextual Shortcut Documentation
**Learning:** Adding new functional shortcuts (like "Reset View") without updating the in-app documentation (Field Guide) creates discoverability issues and frustrates keyboard-heavy users.
**Action:** Every new global shortcut must be documented in the UI's shortcut reference list simultaneously with its implementation.
