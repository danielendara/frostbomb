renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)  |  chrome 156.0.8078.4 headless  |  software renderer: True
5 interleaved rounds (round parity swaps which build runs first), 1 run per round, median of 5 per cell

| seed | profile | tier | fps before→after | p50 ms before→after | p95 ms before→after | p95 after/before | first-frame ms before→after |
|---|---|---|---|---|---|---|---|
| fox | desktop | RICH | 1.2 → 1.2 | 799.9 → 800 | 966.7 → 1016.7 | 1.052 | 419 → 426 |
| fox | desktop | LITE | 38 → 38.6 | 33.3 → 33.2 | 33.4 → 33.4 | 1.000 | 391 → 355 |
| fox | low-end-mobile | RICH | 5.1 → 5.1 | 199.9 → 200 | 216.7 → 216.7 | 1.000 | 331 → 346 |
| fox | low-end-mobile | LITE | 59.2 → 59.7 | 16.7 → 16.7 | 16.8 → 16.8 | 1.000 | 282 → 278 |
| charlie | desktop | RICH | 1.1 → 1.1 | 950 → 933.3 | 1066.7 → 1016.6 | 0.953 | 421 → 422 |
| charlie | desktop | LITE | 17.5 → 19.4 | 50 → 50 | 83.3 → 66.7 | 0.801 | 373 → 346 |
| charlie | low-end-mobile | RICH | 3.9 → 3.7 | 250 → 283.3 | 349.9 → 316.7 | 0.905 | 348 → 360 |
| charlie | low-end-mobile | LITE | 35.6 → 40.8 | 33.3 → 16.7 | 33.4 → 33.4 | 1.000 | 291 → 282 |

Raw p95 ms per round (before | after), round 0..4:

| seed | profile | tier | before | after |
|---|---|---|---|---|
| fox | desktop | RICH | [966.7, 1233.3, 950, 883.3, 1016.7] | [850, 1083.3, 1016.7, 833.2, 1533.3] |
| fox | desktop | LITE | [33.4, 33.4, 33.4, 33.4, 50] | [33.4, 33.4, 33.4, 33.4, 83.2] |
| fox | low-end-mobile | RICH | [183.4, 216.8, 216.7, 216.7, 266.7] | [183.4, 216.7, 200.1, 216.7, 400] |
| fox | low-end-mobile | LITE | [16.8, 16.8, 16.8, 16.7, 50] | [16.7, 16.8, 16.7, 16.8, 33.3] |
| charlie | desktop | RICH | [1050, 1066.7, 1083.4, 1250, 1016.6] | [1016.6, 1016.6, 1000, 1116.7, 1066.7] |
| charlie | desktop | LITE | [66.7, 83.4, 83.4, 83.3, 66.7] | [1983.3, 66.7, 66.7, 66.7, 133.3] |
| charlie | low-end-mobile | RICH | [566.8, 300, 349.9, 333.4, 449.9] | [533.4, 316.7, 300, 283.3, 466.7] |
| charlie | low-end-mobile | LITE | [50.1, 33.4, 33.4, 33.4, 50.1] | [50.1, 33.4, 33.4, 33.4, 33.4] |

budget (p95 after <= before x 1.05): OVER in ('fox', 'desktop', 'rich')=1.052
