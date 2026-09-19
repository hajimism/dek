import { startDevServer } from "../server/dev.ts";
import { generateRemotePassword, remoteBanner } from "../server/lan.ts";
import { keepDevServer } from "./keep-alive.ts";

export async function serveCommand(options: {
  cwd: string;
  deck?: string;
  remote?: boolean;
  password?: string;
  visual?: boolean;
}): Promise<void> {
  const remote = options.remote === true;
  const password = remote ? (options.password ?? generateRemotePassword()) : undefined;
  const server = await startDevServer({
    cwd: options.cwd,
    deck: options.deck,
    remote,
    password,
    visual: options.visual === true,
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
