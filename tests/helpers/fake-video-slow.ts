#!/usr/bin/env bun
// A video worker that takes longer than a test's timeout, then answers like the fake one.
import type { VideoCaptureRequest } from "../../src/video/recorder.ts";
import { captureHoldFrames } from "./video.ts";

const request = JSON.parse(await new Response(Bun.stdin).text()) as VideoCaptureRequest;
await Bun.sleep(80);
process.stdout.write(`${JSON.stringify(captureHoldFrames(request))}\n`);
