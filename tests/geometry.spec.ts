import { expect, test } from '@playwright/test';
import { buildSnowflake } from '../src/snowflake/geometry.ts';
import { Rand } from '../src/snowflake/random.ts';

test('buildSnowflake falls back to top-level conditions for an empty path', () => {
  const result = buildSnowflake(
    {
      temperatureC: -15,
      supersaturation: 0.8,
      habit: 'stellar_dendrite',
      path: [],
    },
    new Rand(() => 0.5),
  );

  expect(result.branchCount).toBeGreaterThan(1);
  expect(result.armCount).toBeGreaterThan(0);
  expect(result.matrices.length).toBe(result.armCount * 6 * 16);
});
