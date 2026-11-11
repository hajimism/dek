/**
 * Watch a coding agent use dek: each scenario in evals/agent/ makes a small broken project, hands
 * the agent a task in a user's words, and checks what it left. Costs model usage; never in CI.
 *
 *   bun scripts/agent-eval.ts [--agent <cmd>] [--scenario <id>] [--runs N] [--out <dir>] [--record <dir>]
 *
 * The report is .cache/agent-eval/<time>/report.json and report.md unless --out says otherwise.
 * --record also writes <dir>/<date>-v<version>.json, each scenario's runs as medians and totals,
 * with no paths and nothing the agent wrote, to commit: evals/agent/results/ keeps them.
 */
import { main } from "../evals/agent/main.ts";

process.exitCode = await main(process.argv.slice(2));
