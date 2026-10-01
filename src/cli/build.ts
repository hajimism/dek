import { buildDeck } from "../core/build.ts";
import type { Diagnostic } from "../core/diagnostic.ts";
import { DekcError } from "../core/error.ts";
import { lintDeck, lintProject } from "../core/lint.ts";
import { parsePublicUrl } from "../core/ogp.ts";
import { PLAYWRIGHT_INSTALL, type PlaywrightRunner } from "../core/playwright.ts";
import { playerScript } from "../runtime/player.ts";
import { type SkippedCheck, skippedChecks, visualSkipped } from "./result.ts";
import type { DecksTarget } from "./scope.ts";

/**
 * A build never fails on lint: at the venue, a deck that shows is better than
 * none. What dekc's own rules say comes back with it, so nobody ships it unaware;
 * rumdl's Markdown style is `dekc lint`'s alone, since it never stops a deck showing.
 */
export type BuildCliResult = {
  /** One file per deck built, a single deck included, so the shape never depends on the scope. */
  outs: string[];
  /** dist/<deck>.png for each deck that got a link preview image. */
  images: string[];
  diagnostics: Diagnostic[];
  /** Why some deck has no preview image, said once per reason. */
  skipped?: SkippedCheck[];
};

const PREVIEW_SKIPPED = {
  "no-url": {
    check: "preview",
    reason: "url is not set",
    hint: "set url in dekc.toml, or pass --url, to the URL dist/ is served from",
  },
  "no-playwright": {
    check: "preview",
    reason: "Playwright is not installed",
    hint: PLAYWRIGHT_INSTALL,
  },
} as const satisfies Record<string, SkippedCheck>;

export async function buildCommand(
  { project, decks }: DecksTarget,
  options: { rootDist?: boolean; url?: string; public?: boolean; runner?: PlaywrightRunner } = {},
): Promise<BuildCliResult> {
  const url = options.url === undefined ? undefined : parsePublicUrl(options.url);
  if (options.url !== undefined && url === undefined) {
    throw new DekcError(`invalid --url "${options.url}"`, {
      hint: "pass the absolute http(s) URL dist/ is served from, like --url https://example.com/talks/",
    });
  }
  const script = await playerScript();
  const results = await Promise.all(
    decks.map((entry) =>
      buildDeck(
        { project, deck: entry },
        {
          playerScript: script,
          rootDist: options.rootDist,
          ...(url ? { url } : {}),
          ...(options.public ? { public: true } : {}),
          ...(options.runner ? { runner: options.runner } : {}),
        },
      ),
    ),
  );
  const diagnostics = [
    ...lintProject(project),
    ...decks.flatMap((entry) => lintDeck({ project, deck: entry })),
  ];
  const skipped = new Set(
    results.flatMap((result) =>
      "imageSkipped" in result ? [PREVIEW_SKIPPED[result.imageSkipped]] : [],
    ),
  );
  return {
    outs: results.map((result) => result.outPath),
    images: results.flatMap((result) => ("image" in result ? [result.image] : [])),
    diagnostics,
    ...skippedChecks([
      ...skipped,
      visualSkipped("dekc lint --visual", {
        reason: "overflow and contrast are measured only by `dekc lint --visual`",
        ...(options.runner ? { runner: options.runner } : {}),
      }),
    ]),
  };
}
