# Direct before vs after on the flake (same capture method: look.mjs, 6 s settle). Per-seed x per-tier gate: EVERY one of the 10 must have >= 1.5% of flake px changed; any failure exits 1.
import numpy as np,sys;from PIL import Image
bad=0
for t in ("rich","lite"):
  for h in ("plate","sector_plate","stellar_dendrite","fernlike_dendrite","capped_column"):
    b=np.asarray(Image.open(f"before-{t}-{h}.png").convert("RGB")).astype(int);a=np.asarray(Image.open(f"after-{t}-{h}.png").convert("RGB")).astype(int)
    f=(0.2126*b[...,0]+0.7152*b[...,1]+0.0722*b[...,2])>70; H,W=f.shape; f[:,:int(W*.28)]=0; f[:,int(W*.78):]=0; f[int(H*.88):]=0
    d=100*(((abs(a-b).max(2)>10)&f).sum())/max(f.sum(),1); ok=d>=1.5; bad+=not ok
    print(f"{'CHANGED' if ok else 'SAME   '} {t}-{h}: {d:.3f}% of {int(f.sum())} flake px")
print("RESULT:", "PASS" if not bad else f"FAIL ({bad} unchanged)"); sys.exit(bool(bad))
