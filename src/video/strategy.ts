/**
 * View Transitions vs CDP Emulation.setVirtualTimePolicy is unverified here.
 * Run `bun scripts/vt-virtual-time.ts` against a local Chromium to revisit.
 *
 * animation-wall-clock: wait for real CSS/VT, screenshot only while animations
 * run, then emit one hold frame for the remaining beat duration. Rendering
 * time follows animation count, not talk length.
 *
 * virtual-time: advance Emulation.setVirtualTimePolicy at 1000/fps ms while
 * animations run (the original proposal). Use after the spike confirms VT follows.
 *
 * wall-clock-1x: rejected. Playwright recordVideo cannot hold 0.2s transitions
 * at public quality and costs one talk-length per bake.
 */
export type VideoCaptureStrategy = "animation-wall-clock" | "virtual-time";

export const VIDEO_CAPTURE_STRATEGY: VideoCaptureStrategy = "animation-wall-clock";
