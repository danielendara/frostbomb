## 2025-05-14 - [InstancedMesh Update Bottleneck]
**Learning:** In Three.js, updating `InstancedMesh` matrices and individual mesh properties in every frame of an `animate` loop is expensive, especially when using spread operators (`...`) which create temporary arrays.
**Action:** Always wrap redundant per-frame geometry updates in conditional blocks that only execute when state actually changes (e.g., during animations or after property updates). Avoid spread operators in hot loops to minimize garbage collection and CPU overhead.
**Impact:** Optimization reduced idle update time to effectively 0ms (from ~0.14ms) by skipping the loop entirely. Combined with spread operator removal, it improves per-frame efficiency during growth animations.
