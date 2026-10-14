import { LAB_TEMP_MAX_C, LAB_TEMP_MIN_C } from "../snowflake/nakaya";

const SS_MIN_PCT = 0;
const SS_MAX_PCT = 100;

export const NAKAYA_NAV_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Map a pointer position over the diagram to Lab conditions (`ss` is 0..1). */
export function nakayaPointToConditions(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { temperatureC: number; ss: number } {
  const x = clamp01((clientX - rect.left) / rect.width);
  const y = clamp01((clientY - rect.top) / rect.height);
  return { temperatureC: x * (LAB_TEMP_MAX_C - LAB_TEMP_MIN_C) + LAB_TEMP_MIN_C, ss: 1 - y };
}

/** Next Lab conditions (temperature °C, supersaturation %) for a key press, or null if unhandled. */
export function nakayaKeyStep(
  key: string,
  shiftKey: boolean,
  current: { temperature: number; supersaturation: number },
): { temperature: number; supersaturation: number } | null {
  const multiplier = shiftKey ? 3 : 1;
  const tStep = 1 * multiplier;
  const ssStep = 5 * multiplier;
  let { temperature, supersaturation } = current;

  switch (key) {
    case "ArrowLeft":
      temperature = Math.max(LAB_TEMP_MIN_C, temperature - tStep);
      break;
    case "ArrowRight":
      temperature = Math.min(LAB_TEMP_MAX_C, temperature + tStep);
      break;
    case "ArrowUp":
      supersaturation = Math.min(SS_MAX_PCT, supersaturation + ssStep);
      break;
    case "ArrowDown":
      supersaturation = Math.max(SS_MIN_PCT, supersaturation - ssStep);
      break;
    case "Home":
      temperature = LAB_TEMP_MIN_C;
      break;
    case "End":
      temperature = LAB_TEMP_MAX_C;
      break;
    case "PageUp":
      supersaturation = Math.min(SS_MAX_PCT, supersaturation + 25);
      break;
    case "PageDown":
      supersaturation = Math.max(SS_MIN_PCT, supersaturation - 25);
      break;
    default:
      return null;
  }
  return { temperature, supersaturation };
}
