export const RAIL_WIDTH_DEFAULT = 188;
export const RAIL_WIDTH_MIN = 120;
export const RAIL_WIDTH_MAX = 360;
export const RAIL_WIDTH_KEY = "dek.railWidth";
export const RAIL_VISIBLE_KEY = "dek.railVisible";

export function isRailToggleKey(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}): boolean {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  return event.key === "s" || event.key === "S";
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
