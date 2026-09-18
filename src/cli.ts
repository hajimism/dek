#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { agentHelpText, formatError, formatErrorText, helpText } from "./cli/format.ts";
import { type CliResult, writeSuccess } from "./cli/result.ts";
import { shouldColor } from "./cli/tty.ts";
import { DekError } from "./core/error.ts";

function stringFlag(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
      json: { type: "boolean", default: false },
      deck: { type: "string" },
      "theme-from": { type: "string" },
      remote: { type: "boolean", default: false },
      password: { type: "string" },
      help: { type: "boolean", default: false },
      agent: { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
      visual: { type: "boolean", default: false },
      shot: { type: "boolean", default: false },
      voice: { type: "boolean", default: false },
      format: { type: "string" },
      before: { type: "string" },
      after: { type: "string" },
      step: { type: "string" },
      accent: { type: "string" },
      fps: { type: "string" },
    },
  });

  if (values.help || positionals[0] === "help") {
    const help = values.agent === true ? agentHelpText() : helpText();
    if (values.json === true && values.agent === true) {
      process.stdout.write(`${JSON.stringify({ ok: true, help })}\n`);
      return;
    }
    process.stdout.write(`${help}\n`);
    return;
  }

  const cwd = process.cwd();
  const command = positionals[0];
  let result: CliResult;

  const deck = stringFlag(values.deck);
  const themeFrom = stringFlag(values["theme-from"]);
  const format = stringFlag(values.format);
  const before = stringFlag(values.before);
  const after = stringFlag(values.after);
  const step = stringFlag(values.step);
  const accent = stringFlag(values.accent);
  const fps = stringFlag(values.fps);

  switch (command) {
    case "init": {
      const { initCommand } = await import("./cli/init.ts");
      result = { command: "init", data: initCommand({ cwd, dir: positionals[1], deck }) };
      break;
    }
    case "new": {
      const { newCommand } = await import("./cli/new.ts");
      result = {
        command: "new",
        data: newCommand({
          cwd,
          name: positionals[1],
          themeFrom,
        }),
      };
      break;
    }
    case "ls": {
      const { lsCommand } = await import("./cli/ls.ts");
      result = {
        command: "ls",
        data: lsCommand({
          cwd,
          deck,
          positionalDeck: positionals[1],
        }),
      };
      break;
    }
    case "show": {
      const { showCommand } = await import("./cli/show.ts");
      result = { command: "show", data: showCommand({ cwd, slug: positionals[1], deck }) };
      break;
    }
    case "sync": {
      const { syncCommand } = await import("./cli/sync.ts");
      result = { command: "sync", data: syncCommand({ cwd, deck }) };
      break;
    }
    case "lint": {
      const { lintCommand } = await import("./cli/lint.ts");
      result = {
        command: "lint",
        data: await lintCommand({
          cwd,
          deck,
          fix: values.fix === true,
          visual: values.visual === true,
        }),
      };
      break;
    }
    case "mv": {
      const { mvCommand } = await import("./cli/mv.ts");
      result = {
        command: "mv",
        data: mvCommand({
          cwd,
          slug: positionals[1],
          to: positionals[2],
          before,
          after,
          deck,
        }),
      };
      break;
    }
    case "build": {
      const { buildCommand } = await import("./cli/build.ts");
      result = { command: "build", data: await buildCommand({ cwd, deck }) };
      break;
    }
    case "check": {
      const { checkCommand } = await import("./cli/check.ts");
      result = {
        command: "check",
        data: await checkCommand({
          cwd,
          slug: positionals[1],
          shot: values.shot === true,
          voice: values.voice === true,
          deck,
        }),
      };
      break;
    }
    case "goto": {
      const { gotoCommand } = await import("./cli/goto.ts");
      result = {
        command: "goto",
        data: await gotoCommand({ cwd, slug: positionals[1], deck }),
      };
      break;
    }
    case "current": {
      const { currentCommand } = await import("./cli/goto.ts");
      result = { command: "current", data: await currentCommand({ cwd, deck }) };
      break;
    }
    case "shot": {
      const { shotCommand } = await import("./cli/shot.ts");
      result = {
        command: "shot",
        data: await shotCommand({ cwd, slug: positionals[1], step, deck }),
      };
      break;
    }
    case "pdf": {
      const { pdfCommand } = await import("./cli/pdf.ts");
      result = { command: "pdf", data: await pdfCommand({ cwd, deck }) };
      break;
    }
    case "cues": {
      const { cuesCommand } = await import("./cli/cues.ts");
      result = { command: "cues", data: cuesCommand({ cwd, deck }) };
      break;
    }
    case "voice": {
      const { voiceCommand } = await import("./cli/voice.ts");
      result = {
        command: "voice",
        data: await voiceCommand({
          cwd,
          deck,
          sub: positionals[1],
          rest: positionals.slice(2),
          accent,
        }),
      };
      break;
    }
    case "video": {
      const { videoCommand } = await import("./cli/video.ts");
      result = {
        command: "video",
        data: await videoCommand({
          cwd,
          slug: positionals[1],
          deck,
          fps,
        }),
      };
      break;
    }
    case "rehearse": {
      const { rehearseCommand } = await import("./cli/rehearse.ts");
      await rehearseCommand({
        cwd,
        slug: positionals[1],
        deck,
        remote: values.remote === true,
        password: stringFlag(values.password),
      });
      return;
    }
    default:
      if (command) {
        throw new DekError(`unknown command: ${command}`, { hint: `run \`dek help --agent\`` });
      }
      {
        const { serveCommand } = await import("./cli/serve.ts");
        await serveCommand({
          cwd,
          remote: values.remote === true,
          password: stringFlag(values.password),
        });
      }
      return;
  }

  writeSuccess(result, { json: values.json === true, format });
}

try {
  await main();
} catch (error) {
  const json = Bun.argv.includes("--json");
  const color = shouldColor(process.stderr);
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: formatError(error) })}\n`);
  } else if (error instanceof DekError && error.message.startsWith("unknown command:")) {
    process.stderr.write(`${formatErrorText(error, { color })}\n\n${helpText()}\n`);
  } else {
    process.stderr.write(`${formatErrorText(error, { color })}\n`);
  }
  process.exit(1);
}
