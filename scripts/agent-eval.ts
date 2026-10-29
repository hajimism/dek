/**
 * Watch a coding agent use dek: each scenario in evals/agent/ makes a small broken project, hands
 * the agent a task in a user's words, and checks what it left. Costs model usage; never in CI.
 *
 *   bun scripts/agent-eval.ts [--agent <cmd>] [--scenario <id>] [--runs N] [--out <dir>]
 *
 * The report is .cache/agent-eval/<time>/report.json and report.md unless --out says otherwise.
 */
import { main } from "../evals/agent/main.ts";

process.exitCode = await main(process.argv.slice(2));
