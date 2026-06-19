import { buildSnowflake } from './src/snowflake/geometry.ts';
import { Rand, mulberry32 } from './src/snowflake/random.ts';

const conditions = {
    temperatureC: -15,
    supersaturation: 0.9,
    habit: 'fernlike_dendrite',
    path: Array(10).fill({ temp: -15, ss: 0.9 })
};

const rng = mulberry32(42);
const rand = new Rand(rng);

// Warmup
for (let i = 0; i < 100; i++) {
    buildSnowflake(conditions as any, rand);
}

const start = performance.now();
const iterations = 1000;
for (let i = 0; i < iterations; i++) {
    buildSnowflake(conditions as any, rand);
}
const end = performance.now();

console.log(`Average buildSnowflake time: ${((end - start) / iterations).toFixed(4)}ms`);
