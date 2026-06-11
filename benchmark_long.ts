import { buildSnowflake } from './src/snowflake/geometry';
import { Rand, mulberry32 } from './src/snowflake/random';

const conditions = {
    path: Array.from({ length: 20 }, (_, i) => {
      return {
        temp: -15,
        ss: 0.95, // High supersaturation for maximum branching
      };
    }),
    habit: 'fernlike_dendrite',
    temperatureC: -15,
    supersaturation: 0.95,
};

const rand = new Rand(mulberry32(12345));

console.log("Running LONG benchmark (100,000 iterations)...");

// Warmup
for (let i = 0; i < 1000; i++) {
    buildSnowflake(conditions as any, rand);
}

const start = performance.now();
const iterations = 100000;
let totalSegments = 0;
for (let i = 0; i < iterations; i++) {
    const res = buildSnowflake(conditions as any, rand);
    totalSegments += res.armCount;
}
const end = performance.now();

console.log(`Average buildSnowflake time: ${(end - start) / iterations}ms`);
console.log(`Average arm segment count: ${totalSegments / iterations}`);
