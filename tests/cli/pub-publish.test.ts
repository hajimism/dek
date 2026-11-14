import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { jsonStdout, runInProcess } from "../helpers/cli.ts";
import { type FakePub, withFakePub } from "../helpers/fake-pub.ts";
import { withTempProject } from "../helpers/project.ts";

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type Json = Record<string, unknown> & { ok: boolean };

const SCRIPT = `---
# yaml-language-server: $schema=../../.dek/schema.json
title: Why dek
event: Meetup #42
duration: 10m
---

## intro

> 目次は読み上げない。

今日は三つ話します。

## speed

速くなりました。
`;

const slide = (slug: string) =>
  `<section class="slide" data-layout="title">\n  <h2 class="slide-title">${slug}</h2>\n</section>\n`;

const spec = (script = SCRIPT) => ({
  decks: [{ name: "Why_Dek", script, slides: { intro: slide("intro"), speed: slide("speed") } }],
});

function signIn(fake: FakePub): void {
  mkdirSync(dirname(fake.credentials), { recursive: true });
  writeFileSync(
    fake.credentials,
    JSON.stringify({ version: 1, keys: { [fake.url]: fake.issueKey() } }),
    { mode: 0o600 },
  );
}

async function publish(fake: FakePub, root: string, args: string[] = [], env = {}) {
  return runInProcess(["pub", "publish", "Why_Dek", "--json", ...args], {
    cwd: root,
    env: { ...fake.env, DEK_PLAYWRIGHT: fakePlaywright, ...env },
  });
}

describe("dekc pub publish", () => {
  test.serial(
    "makes the deck on dek.pub, writes pub: into script.md, and uploads the version",
    async () => {
      await withFakePub(async (fake) => {
        signIn(fake);
        await withTempProject(spec(), async (root) => {
          const scriptPath = join(root, "decks", "Why_Dek", "script.md");
          const result = await publish(fake, root, ["-m", "first"]);
          expect(result.exitCode).toBe(0);
          const json = jsonStdout<Json>(result);
          const [deck] = [...fake.decks.values()];
          expect(json).toMatchObject({
            ok: true,
            action: "publish",
            published: true,
            server: fake.url,
            id: deck?.id,
            n: 1,
            current: 1,
            visibility: "private",
            shots: 2,
            frontmatterWritten: true,
            changed: ["decks/Why_Dek/script.md"],
          });
          expect(deck?.slug).toBe("why-dek");
          // The map is of script.md as sent: with the pub: line, each heading is a line lower.
          const written = readFileSync(scriptPath, "utf8").split("\n");
          const [manifestFirst] = fake.manifests.get(deck?.id ?? "") ?? [];
          expect(manifestFirst?.slideMap.slides.map((entry) => entry.line)).toEqual([
            written.indexOf("## intro") + 1,
            written.indexOf("## speed") + 1,
          ]);
          // Only the pub: line is new.
          expect(readFileSync(scriptPath, "utf8")).toBe(
            SCRIPT.replace("duration: 10m\n", `duration: 10m\npub: ${deck?.id}\n`),
          );

          const upload = fake.requests.find((request) => request.path.endsWith("/versions"));
          expect(upload?.method).toBe("POST");
          expect(upload?.query).toEqual({});
          expect(Object.keys(upload?.fields ?? {}).sort()).toEqual([
            "bare",
            "cover",
            "full",
            "manifest",
            "public",
            "shot:intro",
            "shot:speed",
            "source",
          ]);
          expect(upload?.fields?.full).toMatchObject({
            type: expect.stringMatching(/^text\/html/),
          });
          expect(upload?.fields?.source).toMatchObject({ type: "application/x-tar" });
          expect(upload?.fields?.cover).toMatchObject({ type: "image/png" });
          const [manifest] = fake.manifests.get(deck?.id ?? "") ?? [];
          expect(manifest).toMatchObject({
            protocol: 2,
            deck: "Why_Dek",
            title: "Why dek",
            event: "Meetup #42",
            duration: "10m",
            lang: "ja",
            base: null,
            renames: [],
            message: "first",
            lint: { errors: 0 },
          });
          expect(manifest?.slideMap.out).toBe("public");
          expect(manifest?.slideMap.slides.map((entry) => entry.slug)).toEqual(["intro", "speed"]);
          expect(manifest?.slideMap.slides[0]?.script).not.toContain("目次は読み上げない");
          expect(Object.keys(manifest?.shots ?? {})).toEqual(["intro", "speed"]);
          expect(json.builds).toEqual({
            full: { bytes: expect.any(Number) },
            public: { bytes: expect.any(Number) },
            bare: { bytes: expect.any(Number) },
          });

          // Each reader's build, as it was sent.
          const scratch = join(root, "decks", "Why_Dek", ".cache", "pub");
          const full = readFileSync(join(scratch, "full.html"), "utf8");
          const open = readFileSync(join(scratch, "public.html"), "utf8");
          const bare = readFileSync(join(scratch, "bare.html"), "utf8");
          expect(full).toContain("目次は読み上げない");
          expect(open).toContain("今日は三つ話します");
          expect(open).not.toContain("目次は読み上げない");
          expect(bare).not.toContain("今日は三つ話します");
        });
      });
    },
  );

  test.serial(
    "puts the next version on the newest, with every rename recorded, and --no-promote",
    async () => {
      await withFakePub(async (fake) => {
        signIn(fake);
        await withTempProject(spec(), async (root) => {
          expect((await publish(fake, root)).exitCode).toBe(0);
          const [deck] = [...fake.decks.values()];
          const since = deck?.versions[0]?.createdAt ?? "";
          mkdirSync(join(root, ".dek"), { recursive: true });
          writeFileSync(
            join(root, ".dek", "renames.json"),
            JSON.stringify({
              version: 1,
              decks: {
                Why_Dek: [
                  { from: "old", to: "older", at: "2000-01-01T00:00:00.000Z" },
                  {
                    from: "speed",
                    to: "pace",
                    at: new Date(Date.parse(since) + 1000).toISOString(),
                  },
                ],
              },
            }),
          );
          const result = await publish(fake, root, ["--no-promote"]);
          expect(jsonStdout<Json>(result)).toMatchObject({
            ok: true,
            n: 2,
            current: 1,
            frontmatterWritten: false,
            changed: [],
          });
          const second = fake.manifests.get(deck?.id ?? "")?.[1];
          expect(second?.base).toBe(1);
          // Every rename goes; the server takes each once.
          expect(second?.renames.map((rename) => rename.to)).toEqual(["older", "pace"]);
          expect(fake.requests.at(-1)?.query).toEqual({ promote: "0" });
          expect(fake.decks.size).toBe(1);
        });
      });
    },
  );

  test.serial("stops on a lint error, prints what lint found, and sends nothing", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      const broken = spec();
      broken.decks[0] = {
        ...broken.decks[0],
        slides: { intro: "<div>no section</div>\n", speed: slide("speed") },
      } as never;
      await withTempProject(broken, async (root) => {
        const result = await publish(fake, root);
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<Json & { diagnostics: Array<{ severity: string }> }>(result);
        expect(json).toMatchObject({ ok: false, action: "publish", published: false });
        expect(json.diagnostics.some((entry) => entry.severity === "error")).toBe(true);
        expect(String((json.error as { hint: string }).hint)).toContain("dekc pub publish");
        expect(fake.requests).toEqual([]);
      });
    });
  });

  test.serial("without Playwright sends no pictures and says so", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      await withTempProject(spec(), async (root) => {
        const result = await publish(fake, root, [], { DEK_PLAYWRIGHT: join(root, "missing") });
        const json = jsonStdout<Json & { skipped: Array<{ check: string }> }>(result);
        expect(json).toMatchObject({ ok: true, shots: 0 });
        expect(json.skipped).toContainEqual(
          expect.objectContaining({ check: "shots", reason: "Playwright is not installed" }),
        );
        const upload = fake.requests.find((request) => request.path.endsWith("/versions"));
        expect(Object.keys(upload?.fields ?? {}).sort()).toEqual([
          "bare",
          "full",
          "manifest",
          "public",
          "source",
        ]);
      });
    });
  });

  test.serial("says another version came first, and names dekc pub status", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      await withTempProject(spec(), async (root) => {
        expect((await publish(fake, root)).exitCode).toBe(0);
        fake.respond = (request) =>
          request.path.endsWith("/versions")
            ? Response.json({ error: { code: "stale_base", message: "newer" } }, { status: 409 })
            : undefined;
        const result = await publish(fake, root);
        expect(jsonStdout<Json>(result)).toMatchObject({
          ok: false,
          error: {
            message: "another version of the deck was published since this run looked",
            hint: "run `dekc pub status` to see the versions, then `dekc pub publish` again",
          },
        });
      });
    });
  });

  test.serial("status says whether the newest version is the source as it is here", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      await withTempProject(spec(), async (root) => {
        await publish(fake, root);
        const status = async () =>
          jsonStdout<Json>(
            await runInProcess(["pub", "status", "Why_Dek", "--json"], {
              cwd: root,
              env: fake.env,
            }),
          );
        const first = await status();
        expect(first).toMatchObject({
          ok: true,
          action: "status",
          slug: "why-dek",
          latest: 1,
          local: { published: true },
        });
        writeFileSync(join(root, "decks", "Why_Dek", "slides", "speed.html"), slide("faster"));
        expect(await status()).toMatchObject({ local: { published: false } });
      });
    });
  });

  test.serial("--slug names a new deck's slug; a slug taken says to pass another", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      fake.addDeck({ slug: "why-dek" });
      await withTempProject(spec(), async (root) => {
        const taken = await publish(fake, root);
        expect(jsonStdout<Json>(taken)).toMatchObject({
          ok: false,
          error: { message: "you already have a deck at /@hajime/why-dek" },
        });
        expect(String((jsonStdout<Json>(taken).error as { hint: string }).hint)).toContain(
          "pass --slug <slug>",
        );
        expect(readFileSync(join(root, "decks", "Why_Dek", "script.md"), "utf8")).toBe(SCRIPT);
        const named = await publish(fake, root, ["--slug", "why-dek-2026"]);
        expect(jsonStdout<Json>(named)).toMatchObject({ ok: true, n: 1 });
        expect([...fake.decks.values()].map((deck) => deck.slug)).toEqual([
          "why-dek",
          "why-dek-2026",
        ]);
        const again = await publish(fake, root, ["--slug", "other"]);
        expect(jsonStdout<Json>(again)).toMatchObject({
          ok: false,
          error: { hint: "drop --slug; a deck keeps the slug it was made with" },
        });
        const invalid = await publish(fake, root, ["--slug", "Bad Slug"]);
        expect(jsonStdout<Json>(invalid)).toMatchObject({ ok: false });
      });
    });
  });

  test.serial("says how large a version may be when the server refuses one", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      await withTempProject(spec(), async (root) => {
        fake.respond = (request) =>
          request.path.endsWith("/versions")
            ? Response.json({ error: { code: "too_large", message: "too big" } }, { status: 413 })
            : undefined;
        const result = await publish(fake, root);
        expect(jsonStdout<Json>(result)).toMatchObject({
          ok: false,
          error: {
            message: "too big",
            hint: "a version holds 50 MiB at most, every build, the source, and the pictures together; make the deck's assets smaller, then publish again",
          },
        });
      });
    });
  });
});
