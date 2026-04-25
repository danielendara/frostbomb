import { Rand } from './random.ts';

/**
 * Crystal habits from Nakaya's morphology diagram (1954) and refinements
 * by Libbrecht. Temperature is in °C, supersaturation is relative to ice.
 *
 * The diagram divides (temperature, supersaturation) space into regions
 * where certain crystal habits are favored. A real physical mapping, not
 * arbitrary presets.
 *
 * Rough regions (simplified):
 *   0  to  -4°C : thin plates / simple hexagons (low SS) → dendrites (high SS)
 *  -4  to  -10°C: hollow columns and needles
 *  -10 to -22°C : sector plates, then stellar dendrites around -15°C peak
 *  -22 to -40°C : columns again, then thick plates
 */

export type Habit =
  | 'plate' // simple hexagonal plate
  | 'sector_plate' // plate with sector markings
  | 'stellar_dendrite' // the classic star — six branches with side branches
  | 'fernlike_dendrite' // ultra-branchy, fern-like (high SS at ~-15°C)
  | 'needle' // long thin needle
  | 'column' // solid or hollow column
  | 'capped_column'; // column with plates on each end

export interface GrowthConditions {
  temperatureC: number; // -40 .. 0
  supersaturation: number; // 0..1 (normalized)
  habit: Habit;
  path: { temp: number; ss: number }[];
}

export function sampleConditions(rand: Rand): GrowthConditions {
  // Weighted toward the "interesting" regions — we want stellar dendrites
  // to show up more than plain columns, because they're what people
  // picture when they think "snowflake".
  const roll = rand.next();

  let temperatureC: number;
  let supersaturation: number;
  let habit: Habit;

  if (roll < 0.55) {
    // Stellar / fernlike dendrite zone — around -15°C, high supersaturation
    temperatureC = rand.range(-17, -12);
    supersaturation = rand.range(0.55, 0.95);
    habit = supersaturation > 0.8 ? 'fernlike_dendrite' : 'stellar_dendrite';
  } else if (roll < 0.72) {
    // Sector plates — -10 to -12°C, moderate SS
    temperatureC = rand.range(-12, -9);
    supersaturation = rand.range(0.25, 0.55);
    habit = 'sector_plate';
  } else if (roll < 0.82) {
    // Thin plates — warm, low SS
    temperatureC = rand.range(-3, -0.5);
    supersaturation = rand.range(0.15, 0.45);
    habit = 'plate';
  } else if (roll < 0.9) {
    // Needles — -5 to -7°C, high SS
    temperatureC = rand.range(-7, -5);
    supersaturation = rand.range(0.6, 0.9);
    habit = 'needle';
  } else if (roll < 0.97) {
    // Columns — -5 to -8°C, low SS, or very cold
    temperatureC = rand.chance(0.5) ? rand.range(-8, -5) : rand.range(-30, -22);
    supersaturation = rand.range(0.1, 0.35);
    habit = 'column';
  } else {
    // Capped columns — rare and cool-looking
    temperatureC = rand.range(-8, -6);
    supersaturation = rand.range(0.4, 0.7);
    habit = 'capped_column';
  }

  // Create an atmospheric path — how conditions vary from the core out to the tips
  const path = generatePath(temperatureC, supersaturation, rand);

  return { temperatureC, supersaturation, habit, path };
}

function generatePath(
  startTemp: number,
  startSS: number,
  rand: Rand,
): { temp: number; ss: number }[] {
  const points = [{ temp: startTemp, ss: startSS }];
  const numSteps = 5;

  let currentTemp = startTemp;
  let currentSS = startSS;

  for (let i = 0; i < numSteps; i++) {
    // Atmospheric drift: conditions change slightly as the flake falls
    currentTemp += rand.range(-2, 2);
    currentSS += rand.range(-0.1, 0.1);

    // Clamp to valid ranges
    currentTemp = Math.max(-40, Math.min(0, currentTemp));
    currentSS = Math.max(0.05, Math.min(0.95, currentSS));

    points.push({ temp: currentTemp, ss: currentSS });
  }

  return points;
}

export const habitLabel: Record<Habit, string> = {
  plate: 'Hexagonal plate',
  sector_plate: 'Sector plate',
  stellar_dendrite: 'Stellar dendrite',
  fernlike_dendrite: 'Fernlike dendrite',
  needle: 'Needle',
  column: 'Hollow column',
  capped_column: 'Capped column',
};

/**
 * Deterministically maps (T, SS) to a crystal habit based on the Nakaya diagram.
 */
export function getHabit(temp: number, ss: number): Habit {
  // Simplified Nakaya morphology mapping
  if (temp > -4) {
    return ss > 0.5 ? 'stellar_dendrite' : 'plate';
  }
  if (temp > -9) {
    if (ss > 0.5) return 'needle';
    if (ss > 0.25) return 'capped_column';
    return 'column';
  }
  if (temp > -12) {
    return ss > 0.4 ? 'sector_plate' : 'plate';
  }
  if (temp > -22) {
    if (ss > 0.8) return 'fernlike_dendrite';
    if (ss > 0.5) return 'stellar_dendrite';
    return 'sector_plate';
  }
  return ss > 0.4 ? 'plate' : 'column';
}
