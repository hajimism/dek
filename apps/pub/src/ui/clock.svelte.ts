// The time relative times are counted from. The first render uses the time the server made the
// page, so the browser hydrates the same words; from then on it is the browser's clock, each minute.

const MINUTE = 60_000;

const clock = $state({ now: 0 });
let ticking = false;

/** Now, as the page should show it: the server's time until the browser's clock has started. */
export function now(served: number): number {
  return clock.now || served;
}

/** Start the clock once, after the page has hydrated; returns a function that stops it. */
export function startClock(): () => void {
  if (ticking) {
    return () => {};
  }
  ticking = true;
  clock.now = Date.now();
  const timer = setInterval(() => {
    clock.now = Date.now();
  }, MINUTE);
  return () => {
    clearInterval(timer);
    ticking = false;
  };
}
