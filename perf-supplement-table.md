renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)  |  chrome 156.0.8078.4 headless  |  software renderer: True
5 interleaved rounds (round parity swaps which build runs first), 1 run per round, median of 5 per cell

| seed | profile | tier | fps before→after | p50 ms before→after | p95 ms before→after | p95 after/before | first-frame ms before→after |
|---|---|---|---|---|---|---|---|
| fox | desktop | RICH | 1.1 → 1.3 | 900 → 783.2 | 1066.6 → 866.7 | 0.813 | 418 → 421 |
| charlie | desktop | RICH | 1.1 → 1.1 | 916.6 → 899.9 | 999.9 → 1016.7 | 1.017 | 412 → 415 |

Raw p95 ms per round (before | after), round 0..4:

| seed | profile | tier | before | after |
|---|---|---|---|---|
| fox | desktop | RICH | [883.3, 1066.6, 850, 1833.3, 1066.6] | [1166.6, 866.7, 866.7, 833.3, 866.6] |
| charlie | desktop | RICH | [2116.6, 999.9, 916.7, 966.7, 1050] | [2116.6, 1283.4, 950.1, 916.7, 1016.7] |

budget (p95 after <= before x 1.05): PASS in all 2 cells
