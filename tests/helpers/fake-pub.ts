import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_KEY_HEADER,
  type CommentRow,
  CreateDeckRequest,
  type DeckStatus,
  type Grant,
  MAX_VERSION_BYTES,
  type Me,
  NewCliKey,
  NewGrant,
  NewReply,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  ShareRequest,
  shotField,
  VERSION_FILES,
  VersionManifest,
} from "../../src/pub/protocol.ts";
import { withEnv } from "./env.ts";

/** One request as the fake saw it. */
export type FakeRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  json?: unknown;
  /** A multipart body's fields: a string field as it is, a file by its type, size, and name. */
  fields?: Record<string, string | { type: string; size: number; name: string }>;
};

type Device = { userCode: string; polls: number; denied?: boolean };

/**
 * A deck as the fake keeps it: what status answers, the comment threads on it, the last
 * number a publish took, which counts on from there, and its grants.
 */
type FakeDeck = DeckStatus & { rows: CommentRow[]; latest: number | null; grants: Grant[] };

export type FakePub = {
  url: string;
  /** What points a spawned dek at the fake and at a credentials file of its own. */
  env: Record<string, string>;
  credentials: string;
  requests: FakeRequest[];
  me: Me;
  keys: Set<string>;
  decks: Map<string, FakeDeck>;
  /** Each version's manifest, by deck. */
  manifests: Map<string, VersionManifest[]>;
  /** The polls a device code stays pending before it is approved. */
  pendingPolls: number;
  /** Seconds the device flow says to wait between polls. */
  interval: number;
  /** Turn every new sign-in down. */
  deny?: boolean;
  /** Answer before anything else, to fail a call. */
  respond?: (request: FakeRequest) => Response | undefined;
  /** A key the fake accepts, as login would have left it, for a test that starts signed in. */
  issueKey(): string;
  /** A deck the fake already holds, as a publish from another checkout would have left it. */
  addDeck(deck?: Partial<DeckStatus>): FakeDeck;
};

const ME: Me = { id: "u_1", handle: "hajime", name: "Hajime" };

function error(status: number, code: string, message: string, hint?: string): Response {
  return Response.json({ error: { code, message, ...(hint ? { hint } : {}) } }, { status });
}

/**
 * dek.pub's API in memory, enough for `dekc pub`: the device flow, keys, decks, versions, and
 * comments. Every body is held to the protocol's shapes, so a test fails when the CLI sends one
 * the server would refuse. It points dek at itself through DEK_PUB_SERVER and keeps the key in a
 * credentials file of its own, never the keychain.
 */
export async function withFakePub<T>(fn: (fake: FakePub) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "dek-pub-"));
  let count = 0;
  const id = (prefix: string) => `${prefix}${(++count).toString(36).padStart(12, "0")}`;
  const devices = new Map<string, Device>();
  const tokens = new Set<string>();
  const fake: FakePub = {
    url: "",
    env: {},
    credentials: join(dir, "credentials.json"),
    requests: [],
    me: ME,
    keys: new Set(),
    decks: new Map(),
    manifests: new Map(),
    pendingPolls: 0,
    interval: 0,
    issueKey() {
      const key = id("k_");
      fake.keys.add(key);
      return key;
    },
    addDeck(deck = {}) {
      const made: FakeDeck = {
        id: id("d_"),
        slug: "talk",
        owner: ME.handle,
        title: "Talk",
        url: "",
        visibility: "team",
        scriptPublic: false,
        embed: false,
        comments: "off",
        current: null,
        files: {},
        ...deck,
        rows: [],
        latest: deck.current ?? null,
        grants: [],
      };
      made.url = `${fake.url}/@${made.owner}/${made.slug}`;
      fake.decks.set(made.id, made);
      return made;
    },
  };
  const status = ({
    rows: _rows,
    latest: _latest,
    grants: _grants,
    ...deck
  }: FakeDeck): DeckStatus => deck;

  const server = Bun.serve({
    port: 0,
    async fetch(raw) {
      const url = new URL(raw.url);
      const request: FakeRequest = {
        method: raw.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries(raw.headers),
      };
      const type = raw.headers.get("content-type") ?? "";
      if (type.startsWith("application/json")) {
        request.json = await raw.json();
      } else if (type.startsWith("multipart/form-data")) {
        const form = await raw.formData();
        request.fields = {};
        for (const [name, value] of form) {
          request.fields[name] =
            typeof value === "string"
              ? value
              : { type: value.type, size: value.size, name: (value as File).name };
        }
        (request as FakeRequest & { form?: FormData }).form = form;
      }
      fake.requests.push(request);
      if (request.headers[PROTOCOL_HEADER] !== String(PROTOCOL_VERSION)) {
        return error(400, "protocol", `send ${PROTOCOL_HEADER}: ${PROTOCOL_VERSION}`);
      }
      const answer = fake.respond?.(request);
      if (answer) {
        return answer;
      }
      return route(request, (request as FakeRequest & { form?: FormData }).form);
    },
  });
  fake.url = `http://127.0.0.1:${server.port}`;
  fake.env = {
    DEK_PUB_SERVER: fake.url,
    DEK_PUB_CREDENTIALS: fake.credentials,
    DEK_TOKEN: "",
    DEK_TOKEN_SERVER: "",
  };

  function signedIn(request: FakeRequest): boolean {
    return fake.keys.has(request.headers[API_KEY_HEADER] ?? "");
  }

  async function route(request: FakeRequest, form?: FormData): Promise<Response> {
    const { method, path } = request;
    const body = request.json as Record<string, unknown> | undefined;
    if (method === "POST" && path === "/api/auth/device/code") {
      if (body?.client_id !== "dekc") {
        return Response.json({ error: "invalid_client" }, { status: 400 });
      }
      const deviceCode = id("dc_");
      const userCode = `ABCD-${count}`;
      devices.set(deviceCode, { userCode, polls: 0, ...(fake.deny ? { denied: true } : {}) });
      return Response.json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${fake.url}/device`,
        verification_uri_complete: `${fake.url}/device?user_code=${userCode}`,
        expires_in: 600,
        interval: fake.interval,
      });
    }
    if (method === "POST" && path === "/api/auth/device/token") {
      const device = devices.get(String(body?.device_code));
      if (
        !device ||
        body?.grant_type !== "urn:ietf:params:oauth:grant-type:device_code" ||
        body?.client_id !== "dekc"
      ) {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      if (device.denied) {
        return Response.json({ error: "access_denied" }, { status: 400 });
      }
      device.polls += 1;
      if (device.polls <= fake.pendingPolls) {
        return Response.json({ error: "authorization_pending" }, { status: 400 });
      }
      const token = id("at_");
      tokens.add(token);
      return Response.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
    }
    if (method === "POST" && path === "/api/cli/key") {
      const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
      if (!tokens.has(token)) {
        return error(401, "unauthorized", "no session");
      }
      if (!NewCliKey.safeParse(body ?? {}).success) {
        return error(422, "invalid", "not a NewCliKey");
      }
      return Response.json({ key: fake.issueKey(), me: fake.me });
    }
    // As the server does: revoking needs a key sent, not a valid one.
    if (method === "DELETE" && path === "/api/cli/key" && request.headers[API_KEY_HEADER]) {
      return Response.json({ revoked: fake.keys.delete(request.headers[API_KEY_HEADER] ?? "") });
    }
    if (!signedIn(request)) {
      return error(401, "signed_out", "the key is not valid", "run `dekc pub login`");
    }
    // Every key the fake holds is the one account's.
    if (method === "DELETE" && path === "/api/me/keys") {
      const revoked = fake.keys.size;
      fake.keys.clear();
      return Response.json({ revoked });
    }
    if (method === "GET" && path === "/api/me") {
      return Response.json(fake.me);
    }
    if (method === "POST" && path === "/api/decks") {
      const parsed = CreateDeckRequest.safeParse(body);
      if (!parsed.success) {
        return error(422, "invalid", parsed.error.message);
      }
      if ([...fake.decks.values()].some((deck) => deck.slug === parsed.data.slug)) {
        return error(
          409,
          "slug_taken",
          `you already have a deck at /@${fake.me.handle}/${parsed.data.slug}`,
          "put that deck's ID in pub: in script.md, or rename the deck folder",
        );
      }
      return Response.json(status(fake.addDeck(parsed.data)), { status: 201 });
    }
    const talk = path.match(/^\/api\/people\/([^/]+)\/talks\/([^/]+)$/);
    if (method === "GET" && talk) {
      const found = [...fake.decks.values()].find(
        (deck) => deck.owner === talk[1] && deck.slug === talk[2],
      );
      return found
        ? Response.json({ id: found.id, owner: found.owner, slug: found.slug })
        : error(404, "not_found", "no such deck");
    }
    const match = path.match(/^\/api\/decks\/([^/]+)(\/.*)?$/);
    const deck = match ? fake.decks.get(match[1] ?? "") : undefined;
    if (!match || !deck) {
      return error(404, "not_found", "no such deck");
    }
    const rest = match[2] ?? "";
    if (method === "GET" && rest === "") {
      return Response.json(status(deck));
    }
    if (method === "DELETE" && rest === "") {
      fake.decks.delete(deck.id);
      return Response.json({ deleted: true, id: deck.id, owner: deck.owner, slug: deck.slug });
    }
    if (method === "PATCH" && rest === "") {
      const parsed = ShareRequest.safeParse(body);
      if (!parsed.success) {
        return error(422, "invalid", parsed.error.message);
      }
      const { newLink, ...settings } = parsed.data;
      Object.assign(deck, settings);
      if (newLink) {
        deck.url = `${fake.url}/@${deck.owner}/${deck.slug}?key=${id("")}`;
      }
      return Response.json(status(deck));
    }
    if (method === "POST" && rest === "/versions") {
      const length = Number(request.headers["content-length"]);
      if (!Number.isFinite(length) || length <= 0) {
        return error(411, "length_required", "send the upload with its content-length");
      }
      if (length > MAX_VERSION_BYTES + 4 * 1024 * 1024) {
        return error(413, "too_large", "a version may hold 50 MiB at most");
      }
      return version(deck, form);
    }
    if (method === "GET" && rest === "/comments") {
      const wanted = request.query.status ?? "open";
      const rows = deck.rows.filter((row) =>
        wanted === "all"
          ? true
          : wanted === "resolved"
            ? row.status === "resolved"
            : row.status !== "resolved",
      );
      return Response.json({ comments: rows });
    }
    if (method === "GET" && rest === "/grants") {
      return Response.json({ grants: deck.grants });
    }
    if (method === "POST" && rest === "/grants") {
      const parsed = NewGrant.safeParse(body);
      if (!parsed.success) {
        return error(422, "invalid", parsed.error.message);
      }
      // As the server does: one grant for each person, a new one a guest who may view unless the
      // request says otherwise, and one already made keeping what the request leaves out.
      const who = parsed.data.who.replace(/^@/, "").toLowerCase();
      if (who === fake.me.handle) {
        return error(422, "owner", "the deck is already yours");
      }
      const before = deck.grants.find((grant) => grant.who === who);
      const grant: Grant = before ?? {
        id: id("g_"),
        who,
        role: "view",
        side: "guest",
        createdAt: new Date().toISOString(),
      };
      grant.role = parsed.data.role ?? grant.role;
      grant.side = parsed.data.side ?? grant.side;
      if (!before) {
        deck.grants.push(grant);
      }
      return Response.json(grant, { status: 201 });
    }
    const grantPath = rest.match(/^\/grants\/([^/]+)$/);
    if (method === "DELETE" && grantPath) {
      deck.grants = deck.grants.filter((grant) => grant.id !== grantPath[1]);
      return Response.json({ removed: true });
    }
    const comment = rest.match(/^\/comments\/([^/]+)\/(replies|resolve|reopen)$/);
    const row = comment ? deck.rows.find((entry) => entry.id === comment[1]) : undefined;
    if (comment && !row) {
      return error(404, "not_found", "no such comment");
    }
    if (method === "POST" && comment && row) {
      if (comment[2] === "replies") {
        const parsed = NewReply.safeParse(body);
        if (!parsed.success) {
          return error(422, "invalid", parsed.error.message);
        }
        const reply = {
          id: id("r_"),
          author: { name: fake.me.name, handle: fake.me.handle },
          text: parsed.data.text,
          createdAt: new Date().toISOString(),
        };
        row.thread.push(reply);
        return Response.json(reply, { status: 201 });
      }
      row.status = comment[2] === "resolve" ? "resolved" : "open";
      row.resolvedAt = comment[2] === "resolve" ? new Date().toISOString() : null;
      return Response.json(row);
    }
    return new Response("unexpected request", { status: 500 });
  }

  async function version(deck: FakeDeck, form?: FormData): Promise<Response> {
    const raw = form?.get("manifest");
    const parsed = VersionManifest.safeParse(typeof raw === "string" ? JSON.parse(raw) : undefined);
    if (!parsed.success) {
      return error(422, "invalid", `manifest: ${parsed.error.message}`);
    }
    const manifest = parsed.data;
    if (manifest.base !== deck.current) {
      return error(
        409,
        "stale_base",
        `version ${deck.current ?? "none"} is the current one, not ${manifest.base ?? "none"}`,
        "someone published since; run `dekc pub status` and publish again",
      );
    }
    for (const field of ["full", "public", "bare", "source"] as const) {
      if (!(form?.get(field) instanceof Blob)) {
        return error(422, "invalid", `no ${field}`);
      }
    }
    for (const field of VERSION_FILES) {
      const file = form?.get(field);
      if (file instanceof Blob) {
        const sha = new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
        if (manifest.files[field] !== sha) {
          return error(422, "invalid", `${field} does not match its sha256`);
        }
      }
    }
    for (const slug of Object.keys(manifest.shots)) {
      if (!(form?.get(shotField(slug)) instanceof Blob)) {
        return error(422, "invalid", `no picture of ${slug}`);
      }
    }
    const n = (deck.latest ?? 0) + 1;
    deck.latest = n;
    deck.current = n;
    deck.files = { ...manifest.files };
    fake.manifests.set(deck.id, [...(fake.manifests.get(deck.id) ?? []), manifest]);
    return Response.json(
      { id: deck.id, n, current: deck.current, url: deck.url, visibility: deck.visibility },
      { status: 201 },
    );
  }

  try {
    return await withEnv(fake.env, () => fn(fake));
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}
