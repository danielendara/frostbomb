import { Rand, mulberry32 } from './src/snowflake/random';
import { buildSnowflake } from './src/snowflake/geometry';
import { sampleConditions } from './src/snowflake/nakaya';

function benchmark() {
  const rng = mulberry32(12345);
  const rand = new Rand(rng);

  // Create a complex snowflake (dendrite)
  // Temperature -15, Supersaturation 0.9
  const conditions = {
    temperatureC: -15,
    supersaturation: 0.9,
    habit: 'fernlike_dendrite' as const,
    path: Array(6).fill({ temp: -15, ss: 0.9 })
  };

  const iterations = 10000;
  console.log(`Running benchmark with ${iterations} iterations...`);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    buildSnowflake(conditions, rand);
  }
  const end = performance.now();

  const total = end - start;
  const avg = total / iterations;

  console.log(`Total time: ${total.toFixed(2)}ms`);
  console.log(`Average time: ${avg.toFixed(4)}ms`);
}

benchmark();
