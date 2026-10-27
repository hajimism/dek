/**
 * An agent for testing scripts/agent-eval.ts without a model. It reads the task on stdin, as
 * Claude Code does, finds the scenario that asks it, and works that scenario's known solution in
 * the directory it runs in, printing each shell command as Claude Code's stream-json would.
 * Its `dekc` is whatever PATH finds, so the runner's shim logs it as it would a real agent's.
 */
import { scenarios } from "../../evals/agent/scenarios.ts";

const prompt = (await Bun.stdin.text()).trim();
const scenario = scenarios.find((entry) => entry.prompt === prompt);
if (!scenario) {
  process.stderr.write(`no scenario asks: ${prompt}\n`);
  process.exit(2);
}

const emit = (event: object): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

let turns = 0;
for (const step of scenario.solution) {
  turns += 1;
  if (typeof step !== "string") {
    await step(process.cwd());
    continue;
  }
  const id = `toolu_${turns}`;
  emit({
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name: "Bash", input: { command: step } }] },
  });
  const ran = Bun.spawnSync(["sh", "-c", step], { stdout: "pipe", stderr: "pipe" });
  emit({
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content: `${ran.stdout.toString()}${ran.stderr.toString()}`,
          is_error: ran.exitCode !== 0,
        },
      ],
    },
  });
}
emit({
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: turns,
  result: "Done.",
  total_cost_usd: 0,
  permission_denials: [],
});
