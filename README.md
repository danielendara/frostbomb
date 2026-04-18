# frostbomb

A procedurally generated 3D snowflake in your browser. Every page load grows a new crystal, seeded from the real physics of ice formation — temperature, supersaturation, and the hexagonal symmetry of H₂O.

Refresh the page (or press `R`) to grow another one.

## Stack

- **Vite** + **TypeScript** — fast dev server, type-safe build
- **Three.js** — WebGL rendering with a physical ice material (real refractive index 1.31)
- **simplex-noise** — organic variation in branch thickness
- Zero runtime dependencies beyond the above
- Deploys as static files — no backend

## How the science works

Each visit picks a point on the [Nakaya morphology diagram](https://en.wikipedia.org/wiki/Snowflake#Classification), which maps temperature + supersaturation to a crystal habit:

| Conditions | Habit |
|---|---|
| 0 to -3°C, low SS | Hexagonal plate |
| ~-5°C, high SS | Needle |
| -5 to -8°C, low SS | Hollow column |
| -10 to -12°C | Sector plate |
| **-15°C, high SS** | **Stellar / fernlike dendrite** ← the classic "snowflake" |
| -22 to -40°C | Thick plates, columns |

One arm is generated with seeded-random branching, then rotated-copied 6 times for true hexagonal symmetry — just like the real ice Ih crystal lattice.

## Develop

```sh
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build

```sh
npm run build
```

Output goes to `dist/`.

## Deploy to Cloudflare Pages

1. Push this repo to GitHub
2. In the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. Select this repo and use these build settings:
   - **Framework preset**: `None` (or Vite if listed)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node version**: `20` (set as `NODE_VERSION` env var)
4. Deploy
5. Under **Custom domains**, add `frostbomb.com` and `www.frostbomb.com`

## Share a specific snowflake

Every flake has a 5-character seed (shown in the top right). Share it like:

```
https://frostbomb.com/?seed=k3m7q
```

Anyone visiting that URL sees the identical crystal.

## Keys & buttons

- **R** — grow a new flake
- **Grow another** button — same thing
- Mouse movement — parallax (subtle)
