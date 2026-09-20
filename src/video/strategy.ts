/**
 * Video capture freezes Web Animations at `currentTime` stops, then holds
 * one frame for the rest of the beat. Rendering time follows animation
 * count, not talk length.
 */
export type VideoCaptureStrategy = "web-animations-current-time";

export const VIDEO_CAPTURE_STRATEGY: VideoCaptureStrategy = "web-animations-current-time";
