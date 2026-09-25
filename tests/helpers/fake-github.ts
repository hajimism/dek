import { withEnv } from "./env.ts";

/** One repository: what HEAD and each named rev point at, and each commit's files. */
export type FakeRepo = {
  head: string;
  revs?: Record<string, string>;
  commits: Record<string, Record<string, string>>;
};

export type FakeGithub = {
  url: string;
  /**
   * The variables that point dek at this server. A spawned dek needs them
   * passed: Bun.spawn without `env` does not see withEnv's changes.
   */
  env: Record<string, string>;
  /** Each request's path and Authorization header, in order. */
  requests: Array<{ path: string; authorization: string | null }>;
  repos: Record<string, FakeRepo>;
  /** Answer every request with this status, as GitHub does when rate limited. */
  failWith?: { status: number; headers?: Record<string, string>; body?: string };
  /** Never answer, the way a stalled connection looks to dek. */
  hang?: boolean;
  /** Serve this as every tarball body instead of the archive, streamed without a content-length. */
  tarballBytes?: () => ReadableStream<Uint8Array>;
};

/**
 * Serves the two GitHub endpoints dek ref uses, and points dek at it through
 * DEK_GITHUB_API. `gh` and GITHUB_TOKEN are cleared so a test never reaches
 * the real GitHub or the developer's credentials.
 */
export async function withFakeGithub<T>(
  repos: Record<string, FakeRepo>,
  fn: (fake: FakeGithub) => Promise<T>,
  env: Record<string, string | undefined> = {},
): Promise<T> {
  const fake: FakeGithub = { url: "", env: {}, requests: [], repos };
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      fake.requests.push({
        path: url.pathname,
        authorization: request.headers.get("authorization"),
      });
      if (fake.hang) {
        return new Promise<Response>(() => {});
      }
      if (fake.failWith) {
        return new Response(fake.failWith.body ?? "{}", {
          status: fake.failWith.status,
          headers: fake.failWith.headers,
        });
      }
      const commit = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/commits\/(.+)$/);
      if (commit) {
        const repo = fake.repos[commit[1] ?? ""];
        const rev = decodeURIComponent(commit[2] ?? "");
        const sha =
          rev === "HEAD"
            ? repo?.head
            : (repo?.revs?.[rev] ?? (repo?.commits[rev] ? rev : undefined));
        if (!repo || !sha) {
          return Response.json({ message: "Not Found" }, { status: 404 });
        }
        return new Response(sha);
      }
      const tarball = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/tarball\/(.+)$/);
      if (tarball) {
        return Response.redirect(`${fake.url}/codeload/${tarball[1]}/${tarball[2]}`, 302);
      }
      const codeload = url.pathname.match(/^\/codeload\/([^/]+)\/([^/]+)\/(.+)$/);
      if (codeload) {
        const name = `${codeload[1]}/${codeload[2]}`;
        const sha = codeload[3] ?? "";
        const files = fake.repos[name]?.commits[sha];
        if (!files) {
          return Response.json({ message: "Not Found" }, { status: 404 });
        }
        if (fake.tarballBytes) {
          return new Response(fake.tarballBytes(), {
            headers: { "content-type": "application/x-gzip" },
          });
        }
        const top = `${codeload[1]}-${codeload[2]}-${sha.slice(0, 7)}`;
        const entries = Object.fromEntries(
          Object.entries(files).map(([path, body]) => [`${top}/${path}`, body]),
        );
        const bytes = await new Bun.Archive(entries, { compress: "gzip" }).bytes();
        return new Response(bytes, { headers: { "content-type": "application/x-gzip" } });
      }
      return new Response("unexpected request", { status: 500 });
    },
  });
  fake.url = `http://127.0.0.1:${server.port}`;
  fake.env = { DEK_GITHUB_API: fake.url, DEK_GH: "/nonexistent/gh", GITHUB_TOKEN: "" };
  try {
    return await withEnv({ ...fake.env, GITHUB_TOKEN: undefined, ...env }, () => fn(fake));
  } finally {
    server.stop(true);
  }
}

export const SHA_A = "a".repeat(40);
export const SHA_B = "b".repeat(40);

/** A dek project's files with one deck, as a repository holds them. */
export function deckRepoFiles(
  deck: string,
  options: { prefix?: string; title?: string; extra?: Record<string, string> } = {},
): Record<string, string> {
  const prefix = options.prefix ?? "";
  return {
    [`${prefix}dek.toml`]: "cjk_per_minute = 60\n",
    [`${prefix}decks/${deck}/script.md`]: `---\ntitle: ${options.title ?? deck}\n---\n\n## intro\n\nhello\n`,
    [`${prefix}decks/${deck}/theme.css`]: ".slide { --fg: #111; color: var(--fg); }\n",
    [`${prefix}decks/${deck}/slides/intro.html`]:
      '<section class="slide"><h2>intro</h2></section>\n',
    [`${prefix}decks/${deck}/assets/chart.png`]: "png",
    [`${prefix}decks/${deck}/dist/${deck}.html`]: "built",
    [`${prefix}decks/${deck}/.cache/shots/intro.png`]: "cached",
    [`${prefix}decks/${deck}/voice/voice.toml`]: "",
    ...options.extra,
  };
}
