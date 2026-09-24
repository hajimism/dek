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
  for (const animation of document.getAnimations()) {
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
}
