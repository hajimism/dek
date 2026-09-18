import { writeFileSync } from "node:fs";
import type { Timeline } from "../core/timeline.ts";

export function writeVideoSidecars(options: {
  timeline: Timeline;
  titles: Array<{ slug: string; title: string; startMs: number }>;
  speaker: string;
  engine: string;
  stem: string;
}): { vtt: string; chapters: string; credits: string } {
  const vtt = `${options.stem}.vtt`;
  const chapters = `${options.stem}.chapters.txt`;
  const credits = `${options.stem}.credits.txt`;
  writeFileSync(vtt, renderVtt(options.timeline));
  writeFileSync(chapters, renderChapters(options.titles));
  writeFileSync(credits, `${options.engine}:${options.speaker}\n`);
  return { vtt, chapters, credits };
}

function renderVtt(timeline: Timeline): string {
  const cues: string[] = ["WEBVTT", ""];
  let index = 1;
  for (const beat of timeline.beats) {
    for (const sentence of beat.sentences) {
      cues.push(
        String(index),
        `${formatVtt(sentence.start)} --> ${formatVtt(sentence.end)}`,
        sentence.text,
        "",
      );
      index += 1;
    }
  }
  return `${cues.join("\n")}\n`;
}

function renderChapters(titles: Array<{ title: string; startMs: number }>): string {
  return titles
    .map((entry) => `${formatClock(entry.startMs)} ${entry.title}`)
    .join("\n")
    .concat("\n");
}

function formatVtt(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
