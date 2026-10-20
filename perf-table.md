PR head eb6e29e vs base e3539bd, scripts/perf-orbit.mjs, SwiftShader software renderer (headless). Main: 5 interleaved rounds; extra: 3 rounds with flipped order. Pooled = median over all 8 rounds.

| seed | profile | tier | fps before→after | p95 ms main | p95 ms extra | p95 ms pooled before→after | pooled ratio |
|---|---|---|---|---|---|---|---|
| fox | desktop | RICH | 1.3 → 1.3 | 833.3 → 866.6 | 850 → 966.6 | 841.5 → 875.05 | 1.040 |
| fox | desktop | LITE | 40.2 → 41.5 | 33.4 → 33.4 | 33.4 → 33.4 | 33.4 → 33.4 | 1.000 |
| fox | low-end-mobile | RICH | 5.4 → 5.3 | 216.7 → 216.7 | 216.6 → 216.7 | 216.6 → 216.7 | 1.000 |
| fox | low-end-mobile | LITE | 59.7 → 59.9 | 16.7 → 16.8 | 16.8 → 16.7 | 16.75 → 16.75 | 1.000 |
| charlie | desktop | RICH | 1.1 → 1.1 | 1083.3 → 1066.6 | 1116.6 → 1050 | 1083.3 → 1058.3 | 0.977 |
| charlie | desktop | LITE | 19.1 → 21.1 | 66.7 → 66.7 | 66.7 → 66.7 | 66.7 → 66.7 | 1.000 |
| charlie | low-end-mobile | RICH | 4.4 → 4.3 | 250 → 266.6 | 250 → 250.1 | 250.0 → 258.35 | 1.033 |
| charlie | low-end-mobile | LITE | 42.1 → 44.8 | 33.4 → 33.4 | 33.4 → 33.4 | 33.4 → 33.4 | 1.000 |
