// Short notes at the edge of the screen after something is saved: one line and maybe an Undo.
// A note stays five seconds, longer while it is hovered or focused; an error stays until closed.

export type Toast = {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
};

const VISIBLE_MS = 5000;
const MAX = 3;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const toasts: Toast[] = $state([]);

export function toast(
  message: string,
  options: Omit<Toast, "id" | "message" | "tone"> & { tone?: Toast["tone"] } = {},
): number {
  const id = nextId++;
  toasts.push({
    id,
    message,
    tone: options.tone ?? "info",
    ...(options.action ? { action: options.action } : {}),
  });
  while (toasts.length > MAX) {
    dismiss(toasts[0]?.id ?? id);
  }
  if ((options.tone ?? "info") === "info") {
    resume(id);
  }
  return id;
}

export function dismiss(id: number): void {
  pause(id);
  const at = toasts.findIndex((entry) => entry.id === id);
  if (at !== -1) {
    toasts.splice(at, 1);
  }
}

export function pause(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export function resume(id: number): void {
  const entry = toasts.find((candidate) => candidate.id === id);
  if (!entry || entry.tone === "error") {
    return;
  }
  pause(id);
  timers.set(
    id,
    setTimeout(() => dismiss(id), VISIBLE_MS),
  );
}
