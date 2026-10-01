import type { DevServer } from "../server/dev.ts";
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
  await runDevSession({ cwd: deck.dir, remote: options.remote === true }, (server, password) =>
    rehearseSessionView(server, password, slug),
  );
}

/** What `dekc rehearse` prints once up: the deck in rehearsal, at `slug` when one is named. */
export function rehearseSessionView(
  server: Pick<DevServer, "url" | "remoteUrls">,
  password: string | undefined,
  slug?: string,
): { banner: string; pairPath: string } {
  // Every address opens the rehearsal, so the loopback one is not listed again as the plain deck.
  const rehearsal = (base: string): string => {
    const url = new URL(base);
    url.searchParams.set("rehearse", "");
    if (slug) {
      url.hash = slug;
    }
    return url.toString();
  };
  return {
    banner: remoteBanner(rehearsal(server.url), server.remoteUrls.map(rehearsal), {
      password,
      presenterPaths: ["presenter"],
    }),
    pairPath: "presenter",
  };
}
