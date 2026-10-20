PR head 12227a2 vs base e3539bd. Interleaved, 5 rounds, median per cell. SwiftShader software renderer (headless).

| seed | profile | tier | fps before→after | p50 ms | p95 ms before→after | p95 ratio |
|---|---|---|---|---|---|---|
| fox | desktop | RICH | 1.2 → 1.2 | 816.7 → 800 | 999.9 → 916.6 | 0.917 |
| fox | desktop | LITE | 36.6 → 36.8 | 33.3 → 33.3 | 33.4 → 33.4 | 1.000 |
| fox | low-end-mobile | RICH | 5.3 → 5.2 | 183.4 → 183.3 | 216.7 → 233.3 | 1.077 ⚠ |
| fox | low-end-mobile | LITE | 59.8 → 58.5 | 16.7 → 16.7 | 16.8 → 16.8 | 1.000 |
| charlie | desktop | RICH | 1.1 → 1.1 | 916.7 → 916.6 | 999.9 → 1050 | 1.050 ⚠ |
| charlie | desktop | LITE | 18.1 → 18.6 | 50 → 50 | 66.7 → 66.7 | 1.000 |
| charlie | low-end-mobile | RICH | 4.1 → 4.1 | 233.4 → 233.4 | 266.7 → 266.7 | 1.000 |
| charlie | low-end-mobile | LITE | 35.5 → 36.4 | 33.3 → 33.3 | 33.4 → 33.4 | 1.000 |
