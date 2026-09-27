/**
 * Brings the page to the end of the beat it shows, the way a still of that beat
 * looks: every animation run to its end, the view transition over, and the slide
 * script drawn at the end of its motion. An animation that repeats forever has no
 * end, so it is held at its first frame instead, and every still of it agrees.
 *
 * Runs in the page, shipped by `page.evaluate` or embedded as source in still
 * pages, so it references nothing outside itself.
 */
export function finishBeat(): void {
  // A paused animation seeked past its own end has no effect, so `getAnimations()` leaves it
  // out, yet it never finishes: the go that started it would wait on it forever.
  const held = (window.__dekStarted ?? []).filter((animation) => animation.playState === "paused");
  for (const animation of new Set([...document.getAnimations(), ...held])) {
    const end = animation.effect?.getComputedTiming().endTime;
    if (typeof end === "number" && Number.isFinite(end)) {
      animation.finish();
    } else {
      animation.pause();
      animation.currentTime = 0;
    }
  }
  // Chromium never reports the end of a transition whose animations were paused and
  // seeked, even once they finish; its animations are over, so the transition is too.
  document.activeViewTransition?.skipTransition();
  const motion = window.dekMotion;
  motion?.seek(motion.duration());
  // What the next go finds already here is this beat's, and seeking that go leaves it alone.
  window.__dekSettled = new Set(document.getAnimations());
}
