/** One `dekc` the agent ran, as the shim logged it. */
export type Invocation = {
  argv: string[];
  /** Where it ran, relative to the project: "." at its root. */
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  ms: number;
};

/** An error, a diagnostic, or a skipped check that dek showed the agent, with its hint. */
type Seen = {
  /** The run that printed it, as typed. */
  command: string;
  kind: "error" | "diagnostic" | "skipped";
  /** The rule, for a diagnostic; the check, for a skipped one. */
  id?: string;
  severity?: "error" | "warning";
  message: string;
  hint?: string;
};

/** What one run printed, before it is tied to the run. */
type Told = Omit<Seen, "command">;

export type DekcReport = {
  invocations: number;
  /** Each run in order: as typed, where, and how it exited. */
  commands: Array<{ command: string; cwd: string; exitCode: number }>;
  /** Runs made again where they ran before and answered the same: what dek said did not help. */
  repeated: Array<{ command: string; times: number }>;
  /** Everything dek told the agent was wrong or skipped, once each. */
  seen: Seen[];
  /** The errors in `seen` with no hint: nothing told the agent what to do next. */
  unhinted: Seen[];
  /** Each command a hint named, whether the agent ran it later, and how that run exited. */
  hinted: Array<{ command: string; ran: boolean; exitCode?: number }>;
};

/** What a Claude Code stream-json transcript adds to the log: extra detail, never the verdict. */
export type TranscriptReport = {
  /** Every shell command the agent ran, as it typed it. */
  bash: string[];
  /** Tool calls the agent was refused: a run that met them measured its permissions, not dek. */
  denied: number;
  turns?: number;
  costUsd?: number;
  /** The agent's last message. */
  result?: string;
};

export type RunReport = {
  scenario: string;
  run: number;
  outcome: "passed" | "failed" | "skipped";
  /** What the check found still wrong, or why the run was skipped. */
  reasons: string[];
  wallMs: number;
  agent: { exitCode: number | null; timedOut: boolean };
  dekc: DekcReport;
  transcript?: TranscriptReport;
  /** Where the run's transcript, dekc log, and final project are kept. */
  dir: string;
};

export type EvalReport = {
  agent: string;
  startedAt: string;
  scenarios: Array<{ id: string; prompt: string; runs: RunReport[] }>;
};

/** An invocation as the agent would have typed it. */
function typed(argv: string[]): string {
  const words = argv.map((word) => (/^[\w@%+=:,./-]+$/.test(word) ? word : JSON.stringify(word)));
  return ["dekc", ...words].join(" ");
}

export function dekcReport(invocations: Invocation[]): DekcReport {
  const seen = new Map<string, Seen>();
  for (const invocation of invocations) {
    for (const entry of seenIn(invocation)) {
      const key = JSON.stringify([entry.kind, entry.id, entry.message, entry.hint]);
      if (!seen.has(key)) {
        seen.set(key, { command: typed(invocation.argv), ...entry });
      }
    }
  }
  const all = [...seen.values()];
  return {
    invocations: invocations.length,
    commands: invocations.map(({ argv, cwd, exitCode }) => ({
      command: typed(argv),
      cwd,
      exitCode,
    })),
    repeated: repeats(invocations),
    seen: all,
    unhinted: all.filter(
      (entry) => entry.hint === undefined && (entry.kind === "error" || entry.severity === "error"),
    ),
    hinted: hintedCommands(invocations),
  };
}

function repeats(invocations: Invocation[]): DekcReport["repeated"] {
  const counts = new Map<string, { command: string; times: number }>();
  for (const { argv, cwd, exitCode, stdout, stderr } of invocations) {
    const key = JSON.stringify([argv, cwd, exitCode, stdout, stderr]);
    const count = counts.get(key) ?? { command: typed(argv), times: 0 };
    count.times += 1;
    counts.set(key, count);
  }
  return [...counts.values()].filter((count) => count.times > 1);
}

/**
 * Each `dekc …` a hint quoted, and the first later run that matches it word for word. `--json`
 * changes only how the answer is printed, so it is left out of the match, and a `<placeholder>`
 * matches any one word. A hint that names the run it came from, as "run `dekc lint` again" does,
 * is no lead to follow, so it is left out.
 */
function hintedCommands(invocations: Invocation[]): DekcReport["hinted"] {
  const hinted = new Map<string, DekcReport["hinted"][number]>();
  invocations.forEach((invocation, index) => {
    for (const entry of seenIn(invocation)) {
      for (const match of (entry.hint ?? "").matchAll(/`(dekc [^`]+)`/g)) {
        const command = match[1] ?? "";
        if (hinted.has(command) || matches(command, invocation.argv)) {
          continue;
        }
        const later = invocations.slice(index + 1).find((run) => matches(command, run.argv));
        hinted.set(
          command,
          later ? { command, ran: true, exitCode: later.exitCode } : { command, ran: false },
        );
      }
    }
  });
  return [...hinted.values()];
}

function matches(command: string, argv: string[]): boolean {
  const want = command.split(/\s+/).slice(1);
  const got = argv.filter((word) => word !== "--json");
  return (
    want.length === got.length &&
    want.every((word, index) => /^<[^>]+>$/.test(word) || word === got[index])
  );
}

/**
 * What one run told the agent: from the `--json` envelope when it printed one, else from the
 * text, where an error reads `error: …`, a diagnostic `path: DEK000 …`, a skipped check
 * `visual: skipped (…)`, and the hint of each the `  help: …` line under it.
 */
function seenIn(invocation: Invocation): Told[] {
  const envelopes = invocation.stdout.split("\n").flatMap((line) => {
    try {
      const value = JSON.parse(line) as unknown;
      return value !== null && typeof value === "object" && "ok" in value ? [value] : [];
    } catch {
      return [];
    }
  }) as Envelope[];
  if (envelopes.length > 0) {
    return envelopes.flatMap(fromEnvelope);
  }
  return fromText(`${invocation.stdout}\n${invocation.stderr}`);
}

type Envelope = {
  error?: { message: string; hint?: string };
  diagnostics?: Array<{
    id: string;
    severity: "error" | "warning";
    message: string;
    hint?: string;
  }>;
  skipped?: Array<{ check: string; reason: string; hint?: string }>;
};

function fromEnvelope(envelope: Envelope): Told[] {
  return [
    ...(envelope.error
      ? [withHint({ kind: "error", message: envelope.error.message }, envelope.error.hint)]
      : []),
    ...(envelope.diagnostics ?? []).map(({ id, severity, message, hint }) =>
      withHint({ kind: "diagnostic", id, severity, message }, hint),
    ),
    ...(envelope.skipped ?? []).map(({ check, reason, hint }) =>
      withHint({ kind: "skipped", id: check, message: reason }, hint),
    ),
  ];
}

function withHint(entry: Omit<Seen, "command" | "hint">, hint: string | undefined): Told {
  return hint === undefined ? entry : { ...entry, hint };
}

function fromText(text: string): Told[] {
  const found: Told[] = [];
  for (const line of text.split("\n")) {
    const help = line.match(/^\s+help: (.*)$/);
    const last = found.at(-1);
    if (help && last && last.hint === undefined) {
      last.hint = help[1];
      continue;
    }
    const error = line.match(/^error: (.*)$/);
    const skipped = line.match(/^([a-z][\w-]*): skipped \((.*)\)$/);
    // A total such as "2 errors: DEK001 ×1, DEK002 ×1" names rules but is none.
    const diagnostic = /^\d+ (error|warning)/.test(line)
      ? null
      : line.match(/^(?:.*?: )?(DEK\d{3})( warning:)? (.*)$/);
    if (error) {
      found.push({ kind: "error", message: error[1] ?? "" });
    } else if (skipped) {
      found.push({ kind: "skipped", id: skipped[1] ?? "", message: skipped[2] ?? "" });
    } else if (diagnostic) {
      found.push({
        kind: "diagnostic",
        id: diagnostic[1] ?? "",
        severity: diagnostic[2] ? "warning" : "error",
        message: diagnostic[3] ?? "",
      });
    }
  }
  return found;
}

type StreamEvent = {
  type?: string;
  message?: { content?: Array<{ type?: string; name?: string; input?: { command?: string } }> };
  num_turns?: number;
  total_cost_usd?: number;
  result?: string;
  permission_denials?: unknown[];
};

/** The Bash calls and the result of a Claude Code stream-json transcript; none from other text. */
export function transcriptReport(text: string): TranscriptReport | undefined {
  const events = text.split("\n").flatMap((line) => {
    try {
      const value = JSON.parse(line) as StreamEvent;
      return typeof value?.type === "string" ? [value] : [];
    } catch {
      return [];
    }
  });
  if (events.length === 0) {
    return undefined;
  }
  const bash = events.flatMap((event) =>
    event.type === "assistant"
      ? (event.message?.content ?? []).flatMap((part) =>
          part.type === "tool_use" && part.name === "Bash" && part.input?.command
            ? [part.input.command]
            : [],
        )
      : [],
  );
  const result = events.findLast((event) => event.type === "result");
  return {
    bash,
    denied: result?.permission_denials?.length ?? 0,
    ...(result?.num_turns !== undefined ? { turns: result.num_turns } : {}),
    ...(result?.total_cost_usd !== undefined ? { costUsd: result.total_cost_usd } : {}),
    ...(result?.result !== undefined ? { result: result.result } : {}),
  };
}

const seconds = (ms: number): string => `${Math.round(ms / 1000)}s`;

const quoted = (text: string): string =>
  text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");

/** The report as a maintainer reads it: one row per scenario, then what each run met. */
export function markdown(report: EvalReport): string {
  const rows = report.scenarios.map(({ id, runs }) => {
    const ran = runs.filter((run) => run.outcome !== "skipped");
    const passed = ran.filter((run) => run.outcome === "passed").length;
    const skipped = runs.length - ran.length;
    const each = (value: (run: RunReport) => string | number): string =>
      ran.map(value).join(" / ") || "-";
    const cells = [
      id,
      `${passed}/${ran.length}${skipped > 0 ? `, ${skipped} skipped` : ""}`,
      each((run) => seconds(run.wallMs)),
      each((run) => run.dekc.invocations),
      each((run) => run.dekc.repeated.reduce((sum, entry) => sum + entry.times - 1, 0)),
      each((run) => run.dekc.unhinted.length),
      each((run) => (run.dekc.hinted.some((entry) => entry.ran) ? "yes" : "no")),
    ];
    return `| ${cells.join(" | ")} |`;
  });
  return [
    "# Agent eval",
    "",
    `Agent: \`${report.agent}\`, started ${report.startedAt}.`,
    "",
    "| scenario | passed | time | dekc runs | repeats | errors without a hint | ran a hinted command |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    ...report.scenarios.flatMap(({ id, prompt, runs }) => [
      "",
      `## ${id}`,
      "",
      quoted(prompt),
      ...runs.flatMap(runSection),
    ]),
    "",
  ].join("\n");
}

function runSection(run: RunReport): string[] {
  const head = `### Run ${run.run}: ${run.outcome}`;
  if (run.outcome === "skipped") {
    return ["", head, "", ...run.reasons.map((reason) => `- ${reason}`)];
  }
  const { dekc, transcript } = run;
  const agent = run.agent.timedOut ? "timed out" : `exited ${run.agent.exitCode ?? "by a signal"}`;
  const list = (title: string, items: string[]): string[] =>
    items.length === 0 ? [] : ["", `${title}:`, "", ...items.map((item) => `- ${item}`)];
  const said = (entry: Seen): string =>
    `${entry.id ? `${entry.id} ` : ""}${entry.kind === "diagnostic" ? (entry.severity ?? "") : entry.kind}: ${entry.message}${
      entry.hint ? `\n  - help: ${entry.hint}` : ""
    } (from \`${entry.command}\`)`;
  return [
    "",
    head,
    "",
    `${seconds(run.wallMs)}, ${dekc.invocations} dekc runs; the agent ${agent}${
      transcript?.turns !== undefined ? ` after ${transcript.turns} turns` : ""
    }${transcript?.costUsd !== undefined ? ` for $${transcript.costUsd.toFixed(2)}` : ""}. Files: ${run.dir}`,
    ...list("Still wrong", run.reasons),
    ...list(
      "dekc runs",
      dekc.commands.map(
        (entry) =>
          `\`${entry.command}\`${entry.cwd === "." ? "" : ` in ${entry.cwd}`} exited ${entry.exitCode}`,
      ),
    ),
    ...list(
      "Repeated with the same answer",
      dekc.repeated.map((entry) => `\`${entry.command}\` ${entry.times} times`),
    ),
    ...list("What dek said", dekc.seen.map(said)),
    ...list("Errors without a hint", dekc.unhinted.map(said)),
    ...list(
      "Commands hints named",
      dekc.hinted.map(
        (entry) =>
          `\`${entry.command}\`: ${entry.ran ? `ran, exited ${entry.exitCode}` : "not run"}`,
      ),
    ),
    ...list(
      "Shell commands in the transcript",
      (transcript?.bash ?? []).map((line) => `\`${line}\``),
    ),
    ...list(
      "Refused tool calls",
      transcript && transcript.denied > 0
        ? [`${transcript.denied}: widen --agent's permissions`]
        : [],
    ),
    ...(transcript?.result ? ["", "The agent's last message:", "", quoted(transcript.result)] : []),
  ];
}
