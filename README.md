# ❄️ frost·bomb

A procedurally generated 3D snowflake laboratory in your browser. Every page load grows a unique crystal seeded from the real physics of ice formation — temperature, supersaturation, and the hexagonal symmetry of the H₂O crystal lattice.

**[Live Site](https://frostbomb.com)**

---

## ✨ Features

- **Procedural Growth:** Generates unique geometry based on a 5-character seed.
- **Scientific Accuracy:** Uses the Nakaya morphology diagram to map atmospheric conditions to crystal habits.
- **Atmospheric Path:** Simulates varying conditions as the snowflake "falls," leading to hybrid forms (e.g., plates transitioning to dendrites).
- **Lab Mode:** Take manual control of temperature and humidity to see how they influence growth in real-time.
- **Visual Modes:**
    - **Pink Mode:** A soft, glowing aesthetic.
    - **Prism Mode:** Dynamic HSL color cycling and chromatic dispersion.
- **Interactive:** Full 3D orbit controls, parallax effects, and smooth growth animations.
- **Export:** Save your favorite flakes as high-quality PNGs.

### ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` | **Regrow** a new random snowflake |
| `L` | Toggle **Lab Mode** (manual controls) |
| `P` | Toggle **Pink Mode** |
| `M` | Toggle **Prism Mode** (rainbow) |
| `S` | **Save** current snowflake as PNG |

---

## 🔬 The Science

### Nakaya Morphology Diagram
Each flake is grown by sampling a path through the **Nakaya Diagram**, which maps temperature and supersaturation (humidity) to specific crystal habits:

| Conditions | Habit |
|---|---|
| 0 to -3°C, low SS | Hexagonal plate |
| ~-5°C, high SS | Needle |
| -5 to -8°C, low SS | Hollow column |
| -10 to -12°C | Sector plate |
| **-15°C, high SS** | **Stellar / fernlike dendrite** ← The "classic" snowflake |
| -22 to -40°C | Thick plates, columns |

### Hexagonal Symmetry
Real ice (Ice Ih) has a hexagonal crystal structure. `frostbomb` generates one primary arm using seeded-random branching logic and then rotates it 6 times to ensure true crystallographic symmetry.

---

## ⚡ Performance Optimizations

Built with a focus on 60fps performance, even during complex geometry generation:

- **GPU Update Ranges:** Uses `addUpdateRange` to only transfer modified matrix data to the GPU during growth animations, minimizing PCIe bus traffic.
- **Fast Easing (LUT):** Replaces expensive `Math.pow` calls with a 1024-entry **Look-Up Table (LUT)** for O(1) easing, resulting in a ~7.5x speedup.
- **Trig Expansion:** The snowfall particle system uses the `sin(a+b)` trigonometric identity to reduce `Math.sin` calls from 200 per frame to just 2.
- **Geometry Reuse:** Reuses a single `InstancedMesh` and `CylinderGeometry` to prevent GPU buffer churn and memory fragmentation.
- **Offscreen Caching:** The Nakaya diagram's static background is cached on an offscreen canvas, improving its redraw performance by ~36x.

---

## 🛠️ Tech Stack

- **Vite** + **TypeScript**
- **Three.js** — WebGL rendering with `MeshPhysicalMaterial` for realistic ice (IOR 1.31, dispersion, transmission).
- **postprocessing** — High-quality bloom and SMAA.
- **Tweakpane** — Lightweight UI for Lab Mode.
- **simplex-noise** — Organic variation in branch thickness and angles.
- **Cloudflare Workers** — Static asset hosting and deployment.

---

## 🚀 Development

### Setup
```bash
pnpm install
```

### Local Dev
```bash
pnpm dev
```
Open `http://localhost:5173`.

### Build & Preview
```bash
pnpm build
pnpm preview # Serves the Worker locally with Wrangler
```

### Testing
```bash
pnpm test # Runs Playwright end-to-end tests
```

### Deployment
```bash
pnpm deploy # Deploys to Cloudflare Workers
```

---

## 🔗 Sharing

Every snowflake has a unique seed. Share a specific crystal by appending `?seed=xxxxx` to the URL:

`https://frostbomb.com/?seed=k3m7q`

---

*“A snowflake is one of God's most fragile creations, but look what they can do when they stick together.”*
