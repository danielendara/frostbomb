import { describe, expect, it } from 'vitest';
import {
  getHabit,
  sampleConditions,
  type GrowthConditions,
  type Habit,
} from '../../src/snowflake/nakaya.ts';
import { mulberry32, Rand } from '../../src/snowflake/random.ts';

const EPS = 1e-6;

describe('getHabit', () => {
  const cases: Array<{
    temp: number;
    ss: number;
    habit: Habit;
    label: string;
  }> = [
    // temp > -4: plates at low SS, stellar dendrites at high SS
    { temp: 0, ss: 0, habit: 'plate', label: '0°C dry plate' },
    { temp: 0, ss: 0.5, habit: 'plate', label: '0°C ss=0.5 stays plate' },
    { temp: 0, ss: 0.5 + EPS, habit: 'stellar_dendrite', label: '0°C just above ss=0.5' },
    { temp: -3.9, ss: 0.2, habit: 'plate', label: 'warm interior plate' },
    { temp: -3.9, ss: 0.9, habit: 'stellar_dendrite', label: 'warm interior dendrite' },
    { temp: -4 + EPS, ss: 0.2, habit: 'plate', label: 'just warmer than -4°C plate' },
    { temp: -4 + EPS, ss: 0.9, habit: 'stellar_dendrite', label: 'just warmer than -4°C dendrite' },

    // -4 >= temp > -9: needles / capped columns / columns
    { temp: -4, ss: 0.5 + EPS, habit: 'needle', label: '-4°C needle boundary' },
    { temp: -4, ss: 0.5, habit: 'capped_column', label: '-4°C ss=0.5 capped column' },
    { temp: -4, ss: 0.25 + EPS, habit: 'capped_column', label: '-4°C just above ss=0.25' },
    { temp: -4, ss: 0.25, habit: 'column', label: '-4°C ss=0.25 column' },
    { temp: -5, ss: 0.6, habit: 'needle', label: 'Playwright lab needle point' },
    { temp: -8.9, ss: 0.9, habit: 'needle', label: 'needle interior' },
    { temp: -8.9, ss: 0.3, habit: 'capped_column', label: 'capped column interior' },
    { temp: -8.9, ss: 0.1, habit: 'column', label: 'column interior' },
    { temp: -9 + EPS, ss: 0.9, habit: 'needle', label: 'just warmer than -9°C needle' },
    { temp: -9 + EPS, ss: 0.1, habit: 'column', label: 'just warmer than -9°C column' },

    // -9 >= temp > -12: sector plates vs plates
    { temp: -9, ss: 0.4 + EPS, habit: 'sector_plate', label: '-9°C just above ss=0.4' },
    { temp: -9, ss: 0.4, habit: 'plate', label: '-9°C ss=0.4 plate' },
    { temp: -10, ss: 0.9, habit: 'sector_plate', label: 'sector plate interior high SS' },
    { temp: -11.9, ss: 0.1, habit: 'plate', label: 'sector-band low SS plate' },
    { temp: -12 + EPS, ss: 0.9, habit: 'sector_plate', label: 'just warmer than -12°C sector' },
    { temp: -12 + EPS, ss: 0.1, habit: 'plate', label: 'just warmer than -12°C plate' },

    // -12 >= temp > -22: fernlike / stellar / sector plates
    { temp: -12, ss: 0.8 + EPS, habit: 'fernlike_dendrite', label: '-12°C just above ss=0.8' },
    { temp: -12, ss: 0.8, habit: 'stellar_dendrite', label: '-12°C ss=0.8 stellar' },
    { temp: -12, ss: 0.5 + EPS, habit: 'stellar_dendrite', label: '-12°C just above ss=0.5' },
    { temp: -12, ss: 0.5, habit: 'sector_plate', label: '-12°C ss=0.5 sector plate' },
    { temp: -15, ss: 0.9, habit: 'fernlike_dendrite', label: 'classic fernlike peak' },
    { temp: -15, ss: 0.6, habit: 'stellar_dendrite', label: 'classic stellar peak' },
    { temp: -15, ss: 0.3, habit: 'sector_plate', label: 'dendrite-band low SS' },
    { temp: -20, ss: 0.6, habit: 'stellar_dendrite', label: 'Playwright lab stellar point' },
    { temp: -22 + EPS, ss: 0.9, habit: 'fernlike_dendrite', label: 'just warmer than -22°C fernlike' },
    { temp: -22 + EPS, ss: 0.2, habit: 'sector_plate', label: 'just warmer than -22°C sector' },

    // temp <= -22: plates vs columns
    { temp: -22, ss: 0.4 + EPS, habit: 'plate', label: '-22°C just above ss=0.4' },
    { temp: -22, ss: 0.4, habit: 'column', label: '-22°C ss=0.4 column' },
    { temp: -30, ss: 0.9, habit: 'plate', label: 'cold interior plate' },
    { temp: -40, ss: 0.1, habit: 'column', label: 'cold interior column' },
  ];

  it.each(cases)('$label ($temp°C, ss=$ss → $habit)', ({ temp, ss, habit }) => {
    expect(getHabit(temp, ss)).toBe(habit);
  });

  it('does not return a stale cached habit for a new (T, SS) pair', () => {
    expect(getHabit(-20, 0.6)).toBe('stellar_dendrite');
    expect(getHabit(-20, 0.6)).toBe('stellar_dendrite');
    expect(getHabit(-5, 0.6)).toBe('needle');
    expect(getHabit(-15, 0.9)).toBe('fernlike_dendrite');
  });
});

describe('sampleConditions', () => {
  function conditionsFor(seed: number): GrowthConditions {
    return sampleConditions(new Rand(mulberry32(seed)));
  }

  function scriptedRand(sequence: number[]): Rand {
    let i = 0;
    return new Rand(() => (i < sequence.length ? sequence[i++] : 0));
  }

  it('is deterministic for the same mulberry32 seed', () => {
    const a = conditionsFor(42);
    const b = conditionsFor(42);
    expect(a).toEqual(b);
  });

  it('advances the RNG so consecutive samples from one stream differ', () => {
    const rand = new Rand(mulberry32(42));
    const first = sampleConditions(rand);
    const second = sampleConditions(rand);
    expect(second).not.toEqual(first);
  });

  const seedSnapshots: Array<{
    seed: number;
    habit: Habit;
    temperatureC: number;
    supersaturation: number;
    path: { temp: number; ss: number }[];
  }> = [
    {
      seed: 0,
      habit: 'stellar_dendrite',
      temperatureC: -16.998351271497086,
      supersaturation: 0.639308810979128,
      path: [
        { temp: -16.998351271497086, ss: 0.639308810979128 },
        { temp: -18.41354267974384, ss: 0.6327743755653501 },
        { temp: -18.233346348861232, ss: 0.6558246524538845 },
        { temp: -17.637404829496518, ss: 0.647026094980538 },
        { temp: -17.312528958776966, ss: 0.5962776009924711 },
        { temp: -18.92112217959948, ss: 0.6769637918565423 },
      ],
    },
    {
      seed: 1,
      habit: 'sector_plate',
      temperatureC: -11.991792836459354,
      supersaturation: 0.4082341119879857,
      path: [
        { temp: -11.991792836459354, ss: 0.4082341119879857 },
        { temp: -10.067588966572657, ss: 0.5019096916308627 },
        { temp: -10.943174954736605, ss: 0.5244774637511 },
        { temp: -10.060202390188351, ss: 0.5096368541708216 },
        { temp: -8.080910607473925, ss: 0.5006910796044395 },
        { temp: -8.12575733778067, ss: 0.4284777962835506 },
      ],
    },
    {
      seed: 2,
      habit: 'plate',
      temperatureC: -2.1875039192382246,
      supersaturation: 0.23558881657663733,
      path: [
        { temp: -2.1875039192382246, ss: 0.23558881657663733 },
        { temp: -2.035683289403096, ss: 0.3106464059790597 },
        { temp: -1.5123499215114862, ss: 0.3104867207119242 },
        { temp: -2.0833712986204773, ss: 0.3668045018566773 },
        { temp: -3.6272444038186222, ss: 0.42397789976093925 },
        { temp: -4.821062998147681, ss: 0.40882303321268415 },
      ],
    },
    {
      seed: 4,
      habit: 'column',
      temperatureC: -7.334996297257021,
      supersaturation: 0.12046025497838855,
      path: [
        { temp: -7.334996297257021, ss: 0.12046025497838855 },
        { temp: -8.399007326224819, ss: 0.12215962582267821 },
        { temp: -10.089441372314468, ss: 0.21693200995214285 },
        { temp: -9.601291458355263, ss: 0.2550950999371707 },
        { temp: -8.528707049088553, ss: 0.22892483538016672 },
        { temp: -7.5987274090293795, ss: 0.3040998484939337 },
      ],
    },
    {
      seed: 7,
      habit: 'fernlike_dendrite',
      temperatureC: -16.69020871212706,
      supersaturation: 0.9407630531117319,
      path: [
        { temp: -16.69020871212706, ss: 0.9407630531117319 },
        { temp: -15.894093889277428, ss: 0.9450521068181842 },
        { temp: -16.27200713707134, ss: 0.9382986333221196 },
        { temp: -17.31230639340356, ss: 0.9489637541119008 },
        { temp: -16.393018033821136, ss: 0.9005268663167952 },
        { temp: -17.769224578049034, ss: 0.95 },
      ],
    },
    {
      seed: 12345,
      habit: 'capped_column',
      temperatureC: -7.386495471000671,
      supersaturation: 0.5452616264577955,
      path: [
        { temp: -7.386495471000671, ss: 0.5452616264577955 },
        { temp: -6.11475782096386, ss: 0.5471473003271967 },
        { temp: -6.724870379082859, ss: 0.4618988086935133 },
        { temp: -5.659284509718418, ss: 0.5612640965729953 },
        { temp: -4.359194569289684, ss: 0.5532510712742806 },
        { temp: -2.5758178252726793, ss: 0.6313756795134396 },
      ],
    },
    {
      seed: 4294967295,
      habit: 'needle',
      temperatureC: -6.621043486520648,
      supersaturation: 0.8146958034485579,
      path: [
        { temp: -6.621043486520648, ss: 0.8146958034485579 },
        { temp: -4.844803849235177, ss: 0.8837430897634476 },
        { temp: -4.688243853859603, ss: 0.9198426375165581 },
        { temp: -4.785955468192697, ss: 0.847014185367152 },
        { temp: -2.832177077420056, ss: 0.9213076757267117 },
        { temp: -4.074783242307603, ss: 0.8900450026616453 },
      ],
    },
  ];

  it.each(seedSnapshots)(
    'keeps seed $seed stable as $habit',
    ({ seed, habit, temperatureC, supersaturation, path }) => {
      expect(conditionsFor(seed)).toEqual({
        temperatureC,
        supersaturation,
        habit,
        path,
      });
    },
  );

  const samplingWindows: Array<{
    label: string;
    sequence: number[];
    habit: Habit;
    temperatureC: number;
    supersaturation: number;
  }> = [
    {
      label: 'stellar dendrite zone (roll < 0.55, ss <= 0.8)',
      sequence: [0, 0.5, 0.625],
      habit: 'stellar_dendrite',
      temperatureC: -14.5,
      supersaturation: 0.8,
    },
    {
      label: 'fernlike dendrite zone (roll < 0.55, ss > 0.8)',
      sequence: [0, 0.5, 0.625 + EPS],
      habit: 'fernlike_dendrite',
      temperatureC: -14.5,
      supersaturation: 0.55 + 0.4 * (0.625 + EPS),
    },
    {
      label: 'sector plate zone (0.55 <= roll < 0.72)',
      sequence: [0.55, 0, 0],
      habit: 'sector_plate',
      temperatureC: -12,
      supersaturation: 0.25,
    },
    {
      label: 'thin plate zone (0.72 <= roll < 0.82)',
      sequence: [0.72, 0, 0],
      habit: 'plate',
      temperatureC: -3,
      supersaturation: 0.15,
    },
    {
      label: 'needle zone (0.82 <= roll < 0.9)',
      sequence: [0.82, 0, 0],
      habit: 'needle',
      temperatureC: -7,
      supersaturation: 0.6,
    },
    {
      label: 'warm column zone (0.9 <= roll < 0.97, chance < 0.5)',
      sequence: [0.9, 0, 0, 0],
      habit: 'column',
      temperatureC: -8,
      supersaturation: 0.1,
    },
    {
      label: 'cold column zone (0.9 <= roll < 0.97, chance >= 0.5)',
      sequence: [0.9, 0.5, 0, 0],
      habit: 'column',
      temperatureC: -30,
      supersaturation: 0.1,
    },
    {
      label: 'capped column zone (roll >= 0.97)',
      sequence: [0.97, 0, 0],
      habit: 'capped_column',
      temperatureC: -8,
      supersaturation: 0.4,
    },
  ];

  it.each(samplingWindows)(
    'samples $habit from $label',
    ({ sequence, habit, temperatureC, supersaturation }) => {
      const conditions = sampleConditions(scriptedRand(sequence));
      expect(conditions.habit).toBe(habit);
      expect(conditions.temperatureC).toBeCloseTo(temperatureC, 10);
      expect(conditions.supersaturation).toBeCloseTo(supersaturation, 10);
    },
  );

  it('starts the atmospheric path at the sampled conditions', () => {
    const conditions = conditionsFor(42);
    expect(conditions.path).toHaveLength(6);
    expect(conditions.path[0]).toEqual({
      temp: conditions.temperatureC,
      ss: conditions.supersaturation,
    });
  });

  it('clamps atmospheric path points to valid ranges', () => {
    const cold = sampleConditions(scriptedRand([0.9, 0.5, 0, 0]));
    expect(cold.path.map((p) => p.temp)).toEqual([-30, -32, -34, -36, -38, -40]);
    expect(cold.path.map((p) => p.ss)).toEqual([0.1, 0.05, 0.05, 0.05, 0.05, 0.05]);

    const warm = sampleConditions(scriptedRand(Array(16).fill(0.999999)));
    for (const point of warm.path) {
      expect(point.temp).toBeGreaterThanOrEqual(-40);
      expect(point.temp).toBeLessThanOrEqual(0);
      expect(point.ss).toBeGreaterThanOrEqual(0.05);
      expect(point.ss).toBeLessThanOrEqual(0.95);
    }
    expect(warm.path.at(-1)?.temp).toBe(0);
    expect(warm.path.at(-1)?.ss).toBe(0.95);
  });
});
