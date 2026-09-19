export function isPresenterToggleKey(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}): boolean {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  return event.key === "p" || event.key === "P";
}

export function presenterSearch(search: string, open: boolean): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  if (open) {
    params.set("presenter", "");
  } else {
    params.delete("presenter");
  }
  const encoded = params.toString().replace(/=(?=&|$)/g, "");
  return encoded ? `?${encoded}` : "";
}

export type ElapsedTone = "ok" | "warn" | "over";

export function elapsedTone(
  elapsedSeconds: number,
  budgetSeconds: number | undefined,
): ElapsedTone {
  if (budgetSeconds === undefined || budgetSeconds <= 0) {
    return "ok";
  }
  if (elapsedSeconds > budgetSeconds) {
    return "over";
  }
  if (elapsedSeconds > budgetSeconds * 0.8) {
    return "warn";
  }
  return "ok";
}

export function totalBudgetSeconds(slides: Array<{ budgetSeconds?: number }>): number | undefined {
  let any = false;
  let sum = 0;
  for (const slide of slides) {
    if (slide.budgetSeconds !== undefined) {
      any = true;
      sum += slide.budgetSeconds;
    }
  }
  return any ? sum : undefined;
}

export function progressFill(beatIndex: number, beatCount: number): number {
  const count = Math.max(beatCount, 1);
  return Math.min(1, (beatIndex + 1) / count);
}
