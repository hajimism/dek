import { startDevServer } from "../server/dev.ts";
import { generateRemotePassword, remoteBanner } from "../server/lan.ts";
import { keepDevServer } from "./keep-alive.ts";
import { requireDeckFromCwd } from "./scope.ts";

export async function rehearseCommand(options: {
  cwd: string;
  slug?: string;
  deck?: string;
  remote?: boolean;
  password?: string;
}): Promise<void> {
  const { deck } = requireDeckFromCwd(options.cwd, options.deck);
  const remote = options.remote === true;
  const password = remote ? (options.password ?? generateRemotePassword()) : undefined;
  const server = await startDevServer({ cwd: deck.dir, remote, password });
  const url = new URL(server.url);
  url.searchParams.set("rehearse", "");
  const slug = options.slug?.trim();
  if (slug) {
    url.hash = slug;
  }
  process.stdout.write(
    `${remoteBanner(url.toString(), server.remoteUrls, {
      password,
      presenterPaths: ["presenter"],
    })}\n`,
  );
  await keepDevServer(server);
}
