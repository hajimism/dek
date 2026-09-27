#!/usr/bin/env bun
import type { VideoCaptureRequest } from "../../src/video/recorder.ts";
import { captureHoldFrames } from "./video.ts";

const request = JSON.parse(await new Response(Bun.stdin).text()) as VideoCaptureRequest;
process.stdout.write(`${JSON.stringify(captureHoldFrames(request))}\n`);
