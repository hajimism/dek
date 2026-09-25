import { buildDeck } from "../core/build.ts";
import { type Diagnostic, uniqueDiagnostics } from "../core/diagnostic.ts";
import { DekError } from "../core/error.ts";
import { lintDeck } from "../core/lint.ts";
import { parsePublicUrl } from "../core/ogp.ts";
import { PLAYWRIGHT_INSTALL, type PlaywrightRunner } from "../core/playwright.ts";
import { playerScript } from "../runtime/player.ts";
import { resolveDecks } from "./scope.ts";

/**
 * A build never fails on lint: at the venue, a deck that shows is better than
 * none. What lint would say comes back with it, so nobody ships it unaware.
 */
export type BuildCliResult = {
  /** One file per deck built, a single deck included, so the shape never depends on the scope. */
  outs: string[];
  /** dist/<deck>.png for each deck that got a link preview image. */
  images: string[];
  /** Why some deck has no preview image, said once per reason. */
  notes: string[];
  diagnostics: Diagnostic[];
};

const IMAGE_NOTES = {
  "no-url":
    "no link preview image: set url in dek.toml, or pass --url, to the URL dist/ is served from",
  "no-playwright": `no link preview image: Playwright is not installed; ${PLAYWRIGHT_INSTALL}`,
} as const;

export async function buildCommand(options: {
  cwd: string;
  deck?: string;
  rootDist?: boolean;
  url?: string;
  runner?: PlaywrightRunner;
}): Promise<BuildCliResult> {
  const url = options.url === undefined ? undefined : parsePublicUrl(options.url);
  if (options.url !== undefined && url === undefined) {
    throw new DekError(`invalid --url "${options.url}"`, {
      hint: "pass the absolute http(s) URL dist/ is served from, like --url https://example.com/talks/",
    });
  }
  const { project, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const script = await playerScript();
  const results = await Promise.all(
    decks.map((entry) =>
      buildDeck(
        { project, deck: entry },
        {
          playerScript: script,
          rootDist: options.rootDist,
          ...(url ? { url } : {}),
          ...(options.runner ? { runner: options.runner } : {}),
        },
      ),
    ),
  );
  const diagnostics = uniqueDiagnostics(
    decks.flatMap((entry) => lintDeck({ project, deck: entry })),
  );
  return {
    outs: results.map((result) => result.outPath),
    images: results.flatMap((result) => (result.image ? [result.image] : [])),
    notes: [
      ...new Set(
        results.flatMap((result) =>
          result.imageSkipped ? [IMAGE_NOTES[result.imageSkipped]] : [],
        ),
      ),
    ],
    diagnostics,
  };
}
