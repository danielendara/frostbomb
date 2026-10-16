# Lab Mode habit chips

## Sub-features
- Seven chips, one per crystal habit; active chip `aria-pressed=true`; one Back step returns to the pre-chip URL (Lab toggle itself pushes a history entry).

## How to get to it (user POV)
Open `/?seed=abcde`, click Lab (`#lab-toggle`), click a chip.

## Driving it with Playwright / curl
`scripts/drive-habit-chips.mjs`; spec: `tests/habit-chips.smoke.spec.ts`. Proof: `#stat-habit` = Needle, URL changed, Back restores the URL captured right after Lab turned on.

## Gotchas
Wait for `#lab-status` = ON before clicking; Tweakpane loads lazily.
