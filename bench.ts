import { buildSnowflake } from './src/snowflake/geometry.ts';
import { Rand, hashString, mulberry32 } from './src/snowflake/random.ts';

const conditions = {
  path: Array.from({ length: 40 }, () => ({ temp: -15, ss: 0.9 })),
};

const seed = hashString('complex-seed-123');
const rng = mulberry32(seed);
const rand = new Rand(rng);

console.log('Starting benchmark...');
const iterations = 10000;
const start = performance.now();
for (let i = 0; i < iterations; i++) {
  buildSnowflake(conditions as any, rand);
}
const end = performance.now();
console.log(`Finished ${iterations} iterations in ${(end - start).toFixed(2)}ms`);
console.log(`Average: ${((end - start) / iterations).toFixed(4)}ms per snowflake`);

const result = buildSnowflake(conditions as any, rand);
console.log(`Segments per arm: ${result.armCount}`);
console.log(`Total segments: ${result.branchCount}`);
