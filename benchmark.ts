import { buildSnowflake } from './src/snowflake/geometry.ts';
import { Rand, mulberry32 } from './src/snowflake/random.ts';
import { GrowthConditions } from './src/snowflake/nakaya.ts';

function benchmark() {
  const seed = 12345;
  const rng = mulberry32(seed);
  const rand = new Rand(rng);

  const conditions: GrowthConditions = {
    temperatureC: -15,
    supersaturation: 0.9,
    habit: 'fernlike_dendrite',
    path: [{ temp: -15, ss: 0.9 }]
  };

  const iterations = 100000;

  // Warm up
  for (let i = 0; i < 1000; i++) {
    buildSnowflake(conditions, rand);
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    buildSnowflake(conditions, rand);
  }
  const end = performance.now();

  console.log(`Average buildSnowflake time: ${((end - start) / iterations).toFixed(6)}ms`);
}

benchmark();
