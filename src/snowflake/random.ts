const INV_2_32 = 1 / 4294967296;

// Mulberry32 — small, fast, deterministic PRNG.
// Given the same 32-bit seed, always produces the same sequence.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) * INV_2_32;
  };
}

// Hash a string to a 32-bit seed (for URL ?seed=abc shares)
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Read ?seed=... from URL, otherwise generate a fresh 5-char seed
export function resolveSeed(): { seed: number; label: string } {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('seed');
  if (fromUrl && /^[a-z0-9]{3,12}$/i.test(fromUrl)) {
    return { seed: hashString(fromUrl.toLowerCase()), label: fromUrl.toLowerCase() };
  }
  // Generate a fresh label (base36, 5 chars, easy to share)
  const label = Math.floor(Math.random() * 36 ** 5)
    .toString(36)
    .padStart(5, '0');
  return { seed: hashString(label), label };
}

// Convenience helpers bound to an rng instance
export class Rand {
  constructor(private rng: () => number) {}
  next(): number {
    return this.rng();
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.rng();
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }
  chance(p: number): boolean {
    return this.rng() < p;
  }
}
