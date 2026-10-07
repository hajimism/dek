import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ansi, shouldColor, terminalSafe } from "./tty.ts";

/**
 * The files Bun may read into process.env from the working directory before dek starts: `.env`,
 * `.env.local`, and the two for NODE_ENV, plain and `.local`. All of them are read whatever
 * NODE_ENV is, so a change in which ones Bun picks cannot let a variable through.
 */
const ENV_FILES = [
  ".env",
  ".env.local",
  ...["development", "production", "test"].flatMap((mode) => [
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]),
];

/**
 * Every name dek takes only from the environment that a file holds, however the line around it is
 * written: `K=v`, `export K=v`, `K: v`. Besides DEK_ variables, NODE_TLS_REJECT_UNAUTHORIZED: Bun
 * reads it on each request, and with it a proxy that a `.env` named could read the token `dekc ref`
 * sends. Other variables Bun acts on, such as HTTPS_PROXY, take effect before dek starts, and
 * deleting them changes nothing.
 */
const NAME_RE = /DEK_[A-Z0-9_]*|NODE_TLS_REJECT_UNAUTHORIZED/gi;

/**
 * Takes out of `env` every variable in NAME_RE that a `.env` file in `cwd` may have set, and
 * returns their names. Bun loads those files before dek runs, so a repository someone else wrote
 * could otherwise choose the programs dek runs and the host `dekc ref` calls. These variables come
 * only from the environment dek was started in. Under `--no-env-file`, which the dekc bin passes,
 * Bun loaded nothing, so every one there is the user's own.
 */
export function dropEnvFileVariables(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  execArgv: readonly string[] = process.execArgv,
): string[] {
  if (execArgv.includes("--no-env-file")) {
    return [];
  }
  const names = new Set<string>();
  for (const file of ENV_FILES) {
    let text: string;
    try {
      text = readFileSync(join(cwd, file), "utf8");
    } catch {
      continue;
    }
    for (const [name] of text.matchAll(NAME_RE)) {
      names.add(name.toUpperCase());
    }
  }
  const dropped = [...names].filter((name) => env[name] !== undefined).sort();
  for (const name of dropped) {
    delete env[name];
  }
  return dropped;
}

/** What dek says on stderr about the variables `dropEnvFileVariables` took out. */
export function envFileWarning(names: readonly string[], color = false): string {
  const c = ansi(color);
  const list = names.join(", ");
  return [
    `${c.yellow("warning:")} ignored ${list}: a .env file in this directory sets it, and dek takes it only from the environment`,
    `  ${c.yellow("help:")} set it in the shell that runs dekc instead`,
  ].join("\n");
}

/** The bin's first step: drop what a `.env` set, and say so. */
export function ignoreEnvFileVariables(cwd: string): void {
  const dropped = dropEnvFileVariables(cwd);
  if (dropped.length > 0) {
    process.stderr.write(`${terminalSafe(envFileWarning(dropped, shouldColor(process.stderr)))}\n`);
  }
}
