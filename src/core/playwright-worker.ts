#!/usr/bin/env bun
import { runPlaywrightWorker, type VisualRequest, type VisualResponse } from "./playwright.ts";
import { runVisualRequest } from "./playwright-visual.ts";

await runPlaywrightWorker<VisualRequest, VisualResponse>(runVisualRequest);
