# Summarise flash-*.log: per run, top-5 glint areas' worst debounced crossings in any 1 s window, and per-tile counts.
import json,glob,sys
rows=[];bad=0
for f in sorted(glob.glob("flash-*.log")):
  t=open(f).read(); d=json.loads(t[t.index("{"):]); n=f[6:-4]
  top=max([v[1] for x in d["top5"] for v in x["debounced"].values()] or [0])
  wa={k:(v["worst1sWindowAnyTile"],v["tilesAtOrOver3PerSecond"],v["tilesWithAnyCrossing"]) for k,v in d["worstAny"].items()}
  ok = top < 3 or n.startswith("control")
  bad += not ok
  print(f"{'PASS' if ok else 'FAIL'} {n:28s} tier={d['page']['tier']:4s} glint={d['page'].get('glint')} top5 worst/1s={top}  per-tile (worst/1s, tiles>=3/s, tiles crossing) "+"  ".join(f"T{k}:{v}" for k,v in wa.items()))
print("RESULT:", "PASS (every glint area < 3 flashes/s)" if not bad else "FAIL")
