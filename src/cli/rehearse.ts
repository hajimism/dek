import { remoteBanner } from "../server/lan.ts";
import { type DeckTarget, requireSection } from "./scope.ts";
import { runDevSession } from "./serve.ts";

export async function rehearseCommand(
  { deck }: DeckTarget,
  options: { slug?: string; remote?: boolean },
): Promise<void> {
  const { slug } = options;
  // A typo would start at the first slide as if nothing was asked.
  if (slug) {
    requireSection(deck, slug);
  }
  await runDevSession({ cwd: deck.dir, remote: options.remote === true }, (server, password) => {
    const url = new URL(server.url);
    url.searchParams.set("rehearse", "");
    if (slug) {
      url.hash = slug;
    }
    return {
      banner: remoteBanner(url.toString(), server.remoteUrls, {
        password,
        presenterPaths: ["presenter"],
      }),
      pairPath: "presenter",
    };
  });
}
