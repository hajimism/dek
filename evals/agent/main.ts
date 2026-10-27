import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { type EvalReport, markdown } from "./report.ts";
import { DEFAULT_AGENT, runScenario } from "./run.ts";
import { writeText } from "./scenario.ts";
import { scenarios } from "./scenarios.ts";

const USAGE =
  "bun scripts/agent-eval.ts [--agent <cmd>] [--scenario <id>] [--runs N] [--out <dir>]";

/** Runs the scenarios asked for, writes report.json and report.md, and exits 1 if any failed. */
export async function main(argv: string[]): Promise<number> {
  let values: { agent?: string; scenario?: string[]; runs?: string; out?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        agent: { type: "string" },
        scenario: { type: "string", multiple: true },
        runs: { type: "string" },
        out: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    return fail((error as Error).message, `usage: ${USAGE}`);
  }
  if (values.help) {
    process.stdout.write(
      `${USAGE}\n\nscenarios: ${scenarios.map((scenario) => scenario.id).join(", ")}\ndefault agent: ${DEFAULT_AGENT}\n`,
    );
    return 0;
  }
  const ids = new Set(values.scenario ?? scenarios.map((scenario) => scenario.id));
  const unknown = [...ids].filter((id) => !scenarios.some((scenario) => scenario.id === id));
  if (unknown.length > 0) {
    return fail(
      `no scenario ${unknown.join(", ")}`,
      `use one of: ${scenarios.map((scenario) => scenario.id).join(", ")}`,
    );
  }
  const runs = Number(values.runs ?? "1");
  if (!Number.isInteger(runs) || runs < 1) {
    return fail(`--runs takes a whole number from 1, not ${values.runs}`, "pass --runs 3");
  }
  const startedAt = new Date().toISOString();
  const out = resolve(
    values.out ??
      resolve(import.meta.dir, "..", "..", ".cache", "agent-eval", startedAt.replaceAll(":", "-")),
  );
  const agent = values.agent ?? DEFAULT_AGENT;

  const report: EvalReport = { agent, startedAt, scenarios: [] };
  for (const scenario of scenarios.filter((entry) => ids.has(entry.id))) {
    const done: EvalReport["scenarios"][number] = {
      id: scenario.id,
      prompt: scenario.prompt,
      runs: [],
    };
    report.scenarios.push(done);
    for (let run = 1; run <= runs; run++) {
      const result = await runScenario(scenario, { agent, out, run });
      done.runs.push(result);
      process.stderr.write(
        `${scenario.id} run ${run}: ${result.outcome}, ${Math.round(result.wallMs / 1000)}s, ${result.dekc.invocations} dekc runs\n`,
      );
    }
  }
  const text = markdown(report);
  await writeText(resolve(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeText(resolve(out, "report.md"), text);
  process.stdout.write(`${text}\nwrote ${resolve(out, "report.json")} and report.md\n`);
  const failed = report.scenarios.some(({ runs }) => runs.some((run) => run.outcome === "failed"));
  return failed ? 1 : 0;
}

function fail(message: string, hint: string): number {
  process.stderr.write(`error: ${message}\n  help: ${hint}\n`);
  return 2;
}
