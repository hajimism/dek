#!/usr/bin/env bun
// An ffmpeg that hangs, as one stuck on a broken input would: past any test's timeout, so only
// stopping it ends a test in time.
await Bun.sleep(60_000);
