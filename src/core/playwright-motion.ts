import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { captureGo, loadVideoDoc, settleAt } from "./capture-go.ts";
import type { MotionSpec } from "./playwright.ts";
import type { MotionBeat, MotionFrame } from "./sheet.ts";

/**
 * Plays each beat of the request in the video document `html` the way the talk reaches it, from the
 * beat before. Each go is held at `fractions` of how long it runs, then ended the way a still
 * of that beat ends it, so the last frame is the beat as `dekc shot` shows it. A go that moves
 * nothing is that last frame alone.
 */
export async function captureMotion(
  page: Page,
  html: string,
  motion: MotionSpec,
): Promise<MotionBeat[]> {
  await loadVideoDoc(page, html);
  if (motion.from) {
    await settleAt(page, motion.from);
  }
  const framesDir = join(motion.dir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const beats: MotionBeat[] = [];
  for (const [index, beat] of motion.beats.entries()) {
    const frames: MotionFrame[] = [];
    await captureGo(
      page,
      beat.position,
      (span) => (span > 0 ? motion.fractions.map((fraction) => fraction * span) : []),
      async (ms, end) => {
        const name = end ? "end" : String(Math.round(ms)).padStart(5, "0");
        const path = join(framesDir, `${index + 1}-${name}.png`);
        await page.screenshot({ path, fullPage: false });
        frames.push(end ? { ms, path, end: true } : { ms, path });
      },
    );
    beats.push({ label: beat.label, frames });
  }
  return beats;
}
