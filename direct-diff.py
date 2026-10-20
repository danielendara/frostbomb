# Direct before vs after on the flake, each shot captured twice (<name>.png and <name>-r2.png) with look.mjs
# (settle RICH 6 s / LITE 15 s). Per seed x tier, all must hold (any failure exits 1):
#   brightened >= 1.5% of flake px (after - before > 10 in some channel): glint present
#   LITE brightened <= 15%: sparse, not grain
#   darkened <= 5% (before - after > 10): the glint is purely additive, so a darker after shot is a bad capture
#   repeat variance <= 1% for both before and after (|r1 - r2| > 10): the capture is stable
# Usage: python3 direct-diff.py [--json]   (run in the proof checkout)
import numpy as np, sys, json
from PIL import Image
LITE_MAX, FLOOR, DARK_MAX, REPEAT_MAX = 15.0, 1.5, 5.0, 1.0
L = lambda f: np.asarray(Image.open(f).convert("RGB")).astype(int)
def mask(b):
    f = (0.2126*b[...,0] + 0.7152*b[...,1] + 0.0722*b[...,2]) > 70; H, W = f.shape
    f[:, :int(W*.28)] = 0; f[:, int(W*.78):] = 0; f[int(H*.88):] = 0; return f
pct = lambda m, f: 100.0 * float((m & f).sum()) / max(int(f.sum()), 1)
rows, bad = [], 0
for t in ("rich", "lite"):
    for h in ("plate", "sector_plate", "stellar_dendrite", "fernlike_dendrite", "capped_column"):
        b, b2, a, a2 = (L(f"{p}-{t}-{h}{s}.png") for p, s in (("before",""),("before","-r2"),("after",""),("after","-r2")))
        f = mask(b)
        r = dict(tier=t, habit=h, flake_px=int(f.sum()),
                 brightened=pct((a-b).max(2) > 10, f), darkened=pct((b-a).max(2) > 10, f),
                 repeat_before=pct(np.abs(b-b2).max(2) > 10, f), repeat_after=pct(np.abs(a-a2).max(2) > 10, f))
        why = []
        if r["brightened"] < FLOOR: why.append("NO_GLINT")
        if t == "lite" and r["brightened"] > LITE_MAX: why.append("TOO_MUCH")
        if r["darkened"] > DARK_MAX: why.append("DARKER")
        if max(r["repeat_before"], r["repeat_after"]) > REPEAT_MAX: why.append("UNSTABLE")
        r["status"] = "OK" if not why else ",".join(why); bad += bool(why); rows.append(r)
if "--json" in sys.argv: print(json.dumps(rows)); sys.exit(1 if bad else 0)
print(f"gates: brightened >= {FLOOR}%, LITE brightened <= {LITE_MAX}%, darkened <= {DARK_MAX}%, repeat variance <= {REPEAT_MAX}% (before and after)")
print(f"{'status':10s} {'shot':24s} {'bright%':>8s} {'dark%':>7s} {'rep-bef%':>9s} {'rep-aft%':>9s}")
for r in rows: print(f"{r['status']:10s} {r['tier']+'-'+r['habit']:24s} {r['brightened']:8.3f} {r['darkened']:7.3f} {r['repeat_before']:9.3f} {r['repeat_after']:9.3f}")
print("RESULT:", "PASS" if not bad else f"FAIL ({bad} of {len(rows)})"); sys.exit(1 if bad else 0)
