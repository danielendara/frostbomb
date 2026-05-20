import { buildSnowflake } from './src/snowflake/geometry';
import { Rand, mulberry32 } from './src/snowflake/random';

const conditions = {
    path: Array.from({ length: 15 }, (_, i) => {
      const t = i / 14;
      return {
        temp: -15,
        ss: 0.8,
      };
    }),
};

const rand = new Rand(mulberry32(12345));

// Warmup
for (let i = 0; i < 100; i++) {
    buildSnowflake(conditions as any, rand);
}

import { createNoise2D } from 'simplex-noise';

const startNoise = Date.now();
for (let i = 0; i < 1000; i++) {
    createNoise2D(() => Math.random());
}
console.log(`Average createNoise2D time: ${(Date.now() - startNoise) / 1000}ms`);

const start = Date.now();
const iterations = 1000;
let totalSegments = 0;
for (let i = 0; i < iterations; i++) {
    const res = buildSnowflake(conditions as any, rand);
    totalSegments += res.armCount;
}
const end = Date.now();

console.log(`Average buildSnowflake time: ${(end - start) / iterations}ms`);
console.log(`Average arm segment count: ${totalSegments / iterations}`);
