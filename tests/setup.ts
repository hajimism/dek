import { setDefaultTimeout } from "bun:test";
import { WAIT_MS } from "./helpers/wait.ts";

// Above every helper's wait, so a slow wait fails with its own message, not a bare timeout. This
// reaches only the first test file of a sequential run, so every command that runs the suite
// repeats it as --timeout, which reaches them all; wait.test.ts keeps the two the same.
setDefaultTimeout(WAIT_MS * 2);

// The shell's color choice would reach dek's text and every tool a test spawns, such as tsc;
// a test that wants color sets it itself.
delete process.env.FORCE_COLOR;
delete process.env.NO_COLOR;
