import { RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MAX, RAIL_WIDTH_MIN } from "../core/rail-width.ts";
import { isLetterKey } from "./step.ts";

export { RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MAX, RAIL_WIDTH_MIN };
export const RAIL_WIDTH_KEY = "dek.railWidth";
export const RAIL_VISIBLE_KEY = "dek.railVisible";

export function isRailToggleKey(event: Parameters<typeof isLetterKey>[0]): boolean {
  return isLetterKey(event, "s");
}

/** How far one arrow key press moves the rail's resize handle. */
export const RAIL_WIDTH_STEP = 16;

/**
 * The page's localStorage, or undefined where reading it throws: a file opened with storage
 * blocked, or a sandboxed frame. The rail remembers less there; the deck still runs.
 */
export function pageStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function clampRailWidth(px: number): number {
  if (!Number.isFinite(px)) {
    return RAIL_WIDTH_DEFAULT;
  }
  return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, Math.round(px)));
}

export function readStoredRailWidth(
  storage: { getItem(key: string): string | null } | undefined,
): number {
  try {
    const raw = storage?.getItem(RAIL_WIDTH_KEY);
    return raw ? clampRailWidth(Number(raw)) : RAIL_WIDTH_DEFAULT;
  } catch {
    return RAIL_WIDTH_DEFAULT;
  }
}

export function readStoredRailVisible(
  storage: { getItem(key: string): string | null } | undefined,
): boolean {
  try {
    return storage?.getItem(RAIL_VISIBLE_KEY) !== "0";
  } catch {
    return true;
  }
}
