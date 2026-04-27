# frostbomb

A procedurally generated 3D snowflake in your browser. Every page load grows a new crystal, seeded from the real physics of ice formation — temperature, supersaturation, and the hexagonal symmetry of H₂O.

Refresh the page (or press `R`) to grow another one.

## Stack

- **Vite** + **TypeScript** — fast dev server, type-safe build
- **Three.js** — WebGL rendering with a physical ice material (real refractive index 1.31)
- **simplex-noise** — organic variation in branch thickness
- Zero runtime dependencies beyond the above
- Deploys as static assets on **Cloudflare Workers**

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

## Test

```sh
npm test
```

Playwright starts the local Vite server automatically from `playwright.config.ts`.

## Preview the Worker

```sh
npm run preview
```

This builds the app and serves the Worker locally with Wrangler.

## Deploy to Cloudflare Workers

```sh
npm run deploy
```

The Worker is configured in `wrangler.jsonc` as `frostbombsite`. The Vite Cloudflare plugin builds static assets into `dist/`, and Wrangler deploys those assets to Cloudflare Workers.

Recommended Cloudflare settings:

- **Build command**: `npm run build`
- **Deploy command**: `npm run deploy`
- **Node version**: `20`
- **Custom domain**: `frostbomb.com`

### Domain redirects

This project deploys to Cloudflare Workers, not Cloudflare Pages. Do not use a Pages-style `_redirects` file with absolute URLs; Workers static assets reject that during deploy.

If `www.frostbomb.com` should redirect to `frostbomb.com`, configure it with a Cloudflare Redirect Rule or Worker route so the path and query string are preserved.

## Share a specific snowflake

Every flake has a 5-character seed (shown in the top right). Share it like:

```
https://frostbomb.com/?seed=k3m7q
```

Anyone visiting that URL sees the identical crystal.

## Keys & buttons

- **R** — grow a new flake
- **L** — toggle Lab Mode
- **S** — save snowflake as PNG
- **Grow another** button — same thing
- Mouse movement — parallax (subtle)
