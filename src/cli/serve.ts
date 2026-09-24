import { DekError } from "../core/error.ts";
import { startDevServer } from "../server/dev.ts";
import { generateRemotePassword, remoteBanner } from "../server/lan.ts";
import { keepDevServer } from "./keep-alive.ts";

export async function serveCommand(options: {
  cwd: string;
  deck?: string;
  remote?: boolean;
  password?: string;
  visual?: boolean;
  port?: number;
}): Promise<void> {
  const remote = options.remote === true;
  const password = remote ? (options.password ?? generateRemotePassword()) : undefined;
  const server = await startDevServer({
    cwd: options.cwd,
    deck: options.deck,
    remote,
    password,
    visual: options.visual === true,
    ...(options.port !== undefined ? { port: options.port } : {}),
  });
  process.stdout.write(
    `${remoteBanner(server.url, server.remoteUrls, {
      password,
      presenterPaths: server.deckDir
        ? ["presenter"]
        : server.decks.map((name) => `decks/${name}/presenter`),
    })}\n`,
  );
  await keepDevServer(server);
}

/** `--port`: absent leaves the choice to the OS. */
export function parsePort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const port = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new DekError(`invalid port "${value}"`, {
      hint: "pass a port from 1 to 65535, e.g. `dek --port 3030`",
    });
  }
  return port;
}
