#!/usr/bin/env bun
import { parseCommandLine } from "./cli/flags.ts";
import { agentHelpText, formatError, formatErrorText, helpText } from "./cli/format.ts";
import { type CliResult, writeSuccess } from "./cli/result.ts";
import { peelDeckArg, REF_READERS } from "./cli/scope.ts";
import { shouldColor } from "./cli/tty.ts";
import { commandHelp, helpRequest, unknownCommandError, versionText } from "./cli/usage.ts";
import { isRefName } from "./core/ref-name.ts";
import { resolveProject } from "./core/resolve.ts";

function stringFlag(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The decks a mistyped word may have meant; none outside a project. */
function knownDeckNames(cwd: string): string[] {
  try {
    return resolveProject(cwd).decks.map((deck) => deck.name);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const line = parseCommandLine(Bun.argv.slice(2));
  const { command, values, positionals } = line;

  const request = helpRequest(line);
  if (request) {
    const text =
      request.kind === "version"
        ? versionText()
        : request.topic
          ? commandHelp(request.topic)
          : request.agent
            ? agentHelpText()
            : helpText();
    if (values.json === true) {
      const key = request.kind === "version" ? "version" : "help";
      process.stdout.write(`${JSON.stringify({ ok: true, [key]: text })}\n`);
      return;
    }
    process.stdout.write(`${text}\n`);
    return;
  }

  const cwd = process.cwd();
  let result: CliResult;

  const peeled = peelDeckArg(cwd, {
    command,
    deck: stringFlag(values.deck),
    args: positionals.slice(1),
    before: stringFlag(values.before),
    after: stringFlag(values.after),
  });
  const deck = peeled.deck;
  const args = peeled.rest;
  const themeFrom = stringFlag(values["theme-from"]);
  const format = stringFlag(values.format);
  const before = stringFlag(values.before);
  const after = stringFlag(values.after);
  const step = stringFlag(values.step);
  const to = stringFlag(values.to);
  const at = stringFlag(values.at);
  const accent = stringFlag(values.accent);
  const fps = stringFlag(values.fps);

  if (deck !== undefined && isRefName(deck) && REF_READERS.has(command ?? "")) {
    const { restoreRef } = await import("./cli/ref.ts");
    await restoreRef(cwd, deck);
  }

  switch (command) {
    case "init": {
      const { initCommand } = await import("./cli/init.ts");
      result = {
        command: "init",
        data: initCommand({ cwd, dir: positionals[1], deck: stringFlag(values.deck) }),
      };
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
        }),
      };
      break;
    }
    case "ref": {
      const { refCommand } = await import("./cli/ref.ts");
      result = { command: "ref", data: await refCommand({ cwd, args: positionals.slice(1) }) };
      break;
    }
    case "show": {
      const { showCommand } = await import("./cli/show.ts");
      result = { command: "show", data: showCommand({ cwd, slug: args[0], deck }) };
      break;
    }
    case "theme": {
      const { themeCommand } = await import("./cli/theme.ts");
      result = { command: "theme", data: themeCommand({ cwd, deck, layout: args[0] }) };
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
          slug: args[0],
          to: args[1],
          before,
          after,
          deck,
        }),
      };
      break;
    }
    case "build": {
      const { buildCommand } = await import("./cli/build.ts");
      result = {
        command: "build",
        data: await buildCommand({
          cwd,
          deck,
          rootDist: values["root-dist"] === true,
          ...(typeof values.url === "string" ? { url: values.url } : {}),
        }),
      };
      break;
    }
    case "check": {
      const { checkCommand } = await import("./cli/check.ts");
      result = {
        command: "check",
        data: await checkCommand({
          cwd,
          slug: args[0],
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
        data: await gotoCommand({ cwd, slug: args[0], deck }),
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
        data: await shotCommand({ cwd, slug: args[0], step, to, at, deck }),
      };
      break;
    }
    case "pdf": {
      const { pdfCommand } = await import("./cli/pdf.ts");
      result = {
        command: "pdf",
        data: await pdfCommand({ cwd, deck, rootDist: values["root-dist"] === true }),
      };
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
          sub: args[0],
          rest: args.slice(1),
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
          slug: args[0],
          deck,
          fps,
          rootDist: values["root-dist"] === true,
        }),
      };
      break;
    }
    case "rehearse": {
      const { rehearseCommand } = await import("./cli/rehearse.ts");
      await rehearseCommand({
        cwd,
        slug: args[0],
        deck,
        remote: values.remote === true,
        password: stringFlag(values.password),
      });
      return;
    }
    default:
      if (command) {
        const asDeck = peelDeckArg(cwd, { args: [command] });
        if (asDeck.deck === command) {
          const { parsePort, serveCommand } = await import("./cli/serve.ts");
          await serveCommand({
            cwd,
            deck: command,
            remote: values.remote === true,
            password: stringFlag(values.password),
            visual: values.visual === true,
            port: parsePort(stringFlag(values.port)),
          });
          return;
        }
        throw unknownCommandError(command, knownDeckNames(cwd));
      }
      {
        const { parsePort, serveCommand } = await import("./cli/serve.ts");
        await serveCommand({
          cwd,
          deck,
          remote: values.remote === true,
          password: stringFlag(values.password),
          visual: values.visual === true,
          port: parsePort(stringFlag(values.port)),
        });
      }
      return;
  }

  writeSuccess(result, { json: values.json === true, format, cwd });
}

try {
  await main();
} catch (error) {
  const json = Bun.argv.includes("--json");
  const color = shouldColor(process.stderr);
  const cwd = process.cwd();
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: formatError(error, { cwd }) })}\n`);
  } else {
    process.stderr.write(`${formatErrorText(error, { color, cwd })}\n`);
  }
  process.exitCode = 1;
}
