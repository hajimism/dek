// What `dekc pub` and the dek.pub server say to each other over HTTP. Both sides import this
// file: the CLI from the package, the server (apps/pub) by a relative path. It holds shapes and
// paths only, no I/O, so neither side depends on how the other runs.
//
// What a side sends is held to these shapes strictly. An answer may grow: a server may add a field
// to any answer within a protocol version, and a reader takes an answer through `answerOf`, which
// drops the fields it does not know, so a dekc already installed keeps working. A field is never
// removed, renamed, or given a value its type does not allow without bumping PROTOCOL_VERSION.

import { z } from "zod";

/** Bumped when a shape changes in a way an older side cannot read; the server reads one back. */
export const PROTOCOL_VERSION = 1;

/**
 * `schema` as a reader takes an answer: every object in it, however deep, drops the fields it does
 * not name instead of refusing them. Bounds on strings and arrays are kept; what a field may hold
 * is part of the protocol, and only a new field is a change an older reader must live with.
 */
export function answerOf<S extends z.ZodType>(schema: S): S {
  return loosened(schema) as S;
}

function loosened(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodObject) {
    const shape = Object.fromEntries(
      Object.entries(schema.shape as Record<string, z.ZodType>).map(([key, value]) => [
        key,
        loosened(value),
      ]),
    );
    return z.object(shape);
  }
  if (schema instanceof z.ZodOptional) {
    return loosened(schema.unwrap() as z.ZodType).optional();
  }
  if (schema instanceof z.ZodNullable) {
    return loosened(schema.unwrap() as z.ZodType).nullable();
  }
  if (schema instanceof z.ZodArray) {
    const checks = (schema._zod.def.checks ?? []) as z.core.$ZodCheck<unknown[]>[];
    return z.array(loosened(schema.element as z.ZodType)).check(...checks);
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const options = (schema.options as z.ZodType[]).map(loosened) as [
      z.ZodObject,
      ...z.ZodObject[],
    ];
    return z.discriminatedUnion(schema._zod.def.discriminator, options);
  }
  if (schema instanceof z.ZodUnion) {
    const options = (schema.options as z.ZodType[]).map(loosened) as [z.ZodType, ...z.ZodType[]];
    return z.union(options);
  }
  return schema;
}

/** The most a version may hold, every file and picture together; the server refuses more. */
export const MAX_VERSION_BYTES = 50 * 1024 * 1024;

/** The header the CLI sends its protocol version in. */
export const PROTOCOL_HEADER = "dek-protocol";

/** The header the CLI sends its API key in. */
export const API_KEY_HEADER = "x-api-key";

// ---------------------------------------------------------------------------------------------
// Slide map: what `dekc build --json` says each slide holds, as the server needs it to lay out the
// script article and place comments. It comes from the build the reader sees, so a public build's
// map carries no stage directions.

export const SlideMapStep = z.strictObject({
  /** The stop as `dekc shot --step` takes it: `0` as the slide arrives, else the beat. */
  step: z.string(),
  id: z.string().optional(),
  title: z.string(),
});

export const SlideMapSlide = z.strictObject({
  /** A section ID as script.md has it: lowercase letters, digits and hyphens, a letter among them. */
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .refine((value) => /[a-z]/.test(value)),
  title: z.string().max(500),
  /** The `##` heading's line in script.md. */
  line: z.number().int(),
  steps: z.array(SlideMapStep),
  /** The section's script as this build carries it, as Markdown. */
  script: z.string(),
  /** The paragraphs said aloud, as plain text: inline Markdown unwrapped, lines joined. */
  paragraphs: z.array(z.string()),
});

export const SlideMap = z.strictObject({
  deck: z.string(),
  /** The built HTML file the map is for. */
  out: z.string(),
  slides: z.array(SlideMapSlide).max(1000),
});

export type SlideMap = z.infer<typeof SlideMap>;
export type SlideMapSlide = z.infer<typeof SlideMapSlide>;

// ---------------------------------------------------------------------------------------------
// Decks and versions.

/** What a remote deck's ID looks like. */
export const DECK_ID_RE = /^d_[0-9a-z]{10,32}$/;

/** A remote deck's ID, as `pub:` in script.md's frontmatter holds it. */
export const DeckId = z.string().regex(DECK_ID_RE);

/** Who may open a deck: its owner and grants, anyone with the link, or everyone. */
export const Visibility = z.enum(["private", "link", "public"]);
export type Visibility = z.infer<typeof Visibility>;

/** Who may comment on a deck anyone can open: nobody else, signed-in people, or guests too. */
export const CommentPolicy = z.enum(["off", "signed-in", "guests"]);
export type CommentPolicy = z.infer<typeof CommentPolicy>;

export const Rename = z.strictObject({ from: z.string(), to: z.string(), at: z.string() });
export type Rename = z.infer<typeof Rename>;

/**
 * The files a version is made of, as the upload's form fields name them: the build with the whole
 * script, for its owner; the one with what is said aloud, for readers when the script is public;
 * the bare one with no script, for readers when it is not; the source; and the first slide's
 * picture.
 */
export const VERSION_FILES = ["full", "public", "bare", "source", "cover"] as const;
export type VersionFile = (typeof VERSION_FILES)[number];

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** The form field a slide's picture is sent in, a PNG of the slide with every beat shown. */
export const shotField = (slug: string) => `shot:${slug}`;

export const LintSummary = z.strictObject({
  errors: z.number().int(),
  warnings: z.number().int(),
});
export type LintSummary = z.infer<typeof LintSummary>;

/** The `manifest` field of a version upload, beside its files. */
export const VersionManifest = z.strictObject({
  protocol: z.number().int(),
  dekVersion: z.string(),
  /** The deck's folder name in the project. */
  deck: z.string(),
  title: z.string(),
  description: z.string().optional(),
  event: z.string().max(500).optional(),
  /** The talk's date, as the frontmatter writes it: YYYY-MM-DD. */
  date: z.iso.date().optional(),
  /** A BCP 47 language tag. */
  lang: z
    .string()
    .regex(/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/)
    .optional(),
  /** The newest version this one was made on, or null for the first; 409 when it is not. */
  base: z.number().int().nullable(),
  /** The public build's map: the article and comment anchors use it. */
  slideMap: SlideMap,
  lint: LintSummary,
  /** Slugs `dekc mv` renamed since the version this one was made on. */
  renames: z.array(Rename),
  message: z.string().optional(),
  /** sha256 of each file sent, hex. */
  files: z.partialRecord(z.enum(VERSION_FILES), Sha256),
  /** sha256 of each slide's picture with every beat shown, by slug; each is sent as `shot:<slug>`. */
  shots: z.record(z.string(), Sha256),
});
export type VersionManifest = z.infer<typeof VersionManifest>;

export const CreateDeckRequest = z.strictObject({
  /** The slug in the deck's URL; the folder name unless the author picks another. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  title: z.string(),
});

export const VersionSummary = z.strictObject({
  n: z.number().int(),
  dekVersion: z.string(),
  message: z.string().nullable(),
  bytes: z.number().int(),
  lint: LintSummary,
  createdAt: z.string(),
  /** Slugs whose slide or script differs from the version before. */
  changed: z.array(z.string()).optional(),
});
export type VersionSummary = z.infer<typeof VersionSummary>;

export const DeckStatus = z.strictObject({
  id: DeckId,
  slug: z.string(),
  owner: z.string().describe("The owner's handle."),
  title: z.string(),
  url: z.string(),
  visibility: Visibility,
  scriptPublic: z.boolean(),
  embed: z.boolean(),
  comments: CommentPolicy,
  /** The version readers see; null before the first upload. */
  current: z.number().int().nullable(),
  /** The newest version uploaded. */
  latest: z.number().int().nullable(),
  /** sha256 of each file of the newest version, to tell what changed locally. */
  files: z.partialRecord(z.enum(VERSION_FILES), z.string()),
  versions: z.array(VersionSummary),
});
export type DeckStatus = z.infer<typeof DeckStatus>;

export const PublishResult = z.strictObject({
  id: DeckId,
  n: z.number().int(),
  current: z.number().int().nullable(),
  url: z.string(),
  visibility: Visibility,
});
export type PublishResult = z.infer<typeof PublishResult>;

export const ShareRequest = z.strictObject({
  visibility: Visibility.optional(),
  scriptPublic: z.boolean().optional(),
  embed: z.boolean().optional(),
  comments: CommentPolicy.optional(),
});
export type ShareRequest = z.infer<typeof ShareRequest>;

export const PromoteRequest = z.strictObject({ n: z.number().int() });

// ---------------------------------------------------------------------------------------------
// Comments. Their row has the shape of a `dekc annotations` row where the two mean the same, so an
// agent reads both one way; `author`, `url`, `thread` and `anchor` are what a remote one adds.

export const Box = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/** An element of a slide, found as annotate finds it. */
export const ElementTarget = z.strictObject({
  kind: z.literal("element"),
  /** The slide's HTML file in the deck, as `slides/intro.html`. */
  path: z.string().max(300),
  /** Its tag and classes, as `div.chevron`. */
  name: z.string().max(300),
  /** Its text when the comment was written, cut short. */
  text: z.string().max(300),
  box: Box,
});

/** A passage of the script, held as the W3C TextQuoteSelector holds one. */
export const QuoteTarget = z.strictObject({
  kind: z.literal("quote"),
  quote: z.string().min(1).max(500),
  prefix: z.string().max(32),
  suffix: z.string().max(32),
});

export const CommentTarget = z.discriminatedUnion("kind", [ElementTarget, QuoteTarget]);
export type CommentTarget = z.infer<typeof CommentTarget>;

export const CommentAnchor = z.strictObject({
  slug: z.string(),
  step: z.string(),
  targets: z.array(CommentTarget).max(8),
});
export type CommentAnchor = z.infer<typeof CommentAnchor>;

/**
 * Where a comment stands on the version it is shown on: `open`; `moved` when its slide was found
 * again only by a rename or a guess; `detached` when its passage or element is not on the slide
 * now; `resolved` once someone closed it.
 */
export const CommentStatus = z.enum(["open", "moved", "detached", "resolved"]);
export type CommentStatus = z.infer<typeof CommentStatus>;

export const Author = z.strictObject({
  name: z.string(),
  /** The handle of a signed-in author; absent for a guest. */
  handle: z.string().optional(),
  guest: z.boolean(),
});

export const Reply = z.strictObject({
  id: z.string(),
  author: Author,
  text: z.string(),
  createdAt: z.string(),
});

/**
 * Who reads a thread: `team`, the owner and those invited on the team's side; `shared`, the
 * clients too.
 */
export const ThreadScope = z.enum(["team", "shared"]);
export type ThreadScope = z.infer<typeof ThreadScope>;

export const CommentRow = z.strictObject({
  number: z
    .number()
    .int()
    .describe(
      "Per deck and scope, in the order the threads were opened or shared; a team thread's is shown as T and the number.",
    ),
  id: z.string(),
  scope: ThreadScope.describe("team: the deck's team only; shared: its clients too."),
  slug: z.string(),
  step: z.string(),
  status: CommentStatus,
  text: z.string(),
  targets: z.array(CommentTarget),
  author: Author,
  /** The version the thread was opened on. */
  version: z.number().int(),
  url: z.string(),
  thread: z.array(Reply),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type CommentRow = z.infer<typeof CommentRow>;

export const CommentList = z.strictObject({ comments: z.array(CommentRow) });

export const NewComment = z.strictObject({
  anchor: CommentAnchor,
  /** The version the commenter was reading; the current one when absent. */
  version: z.number().int().min(1).optional(),
  text: z.string().min(1).max(4000),
  /** Who reads it; when absent, `team` for one on the team's side and `shared` for anyone else. */
  scope: ThreadScope.optional(),
  /** A guest's name; ignored when signed in. */
  guestName: z.string().min(1).max(60).optional(),
  /** Turnstile's token, for a guest. */
  turnstile: z.string().optional(),
});
export type NewComment = z.infer<typeof NewComment>;

export const NewReply = z.strictObject({
  text: z.string().min(1).max(4000),
  guestName: z.string().min(1).max(60).optional(),
  turnstile: z.string().optional(),
});

// ---------------------------------------------------------------------------------------------
// Grants: people other than the owner who may open, or comment on, a deck that is not public.

export const GrantRole = z.enum(["view", "comment"]);
/** Which side of the work a grantee is on: the `team` that makes the deck, or its `client`. */
export const GrantSide = z.enum(["team", "client"]);
export const Grant = z.strictObject({
  id: z.string(),
  /** A signed-in person's handle, or an email address no account has claimed yet. */
  who: z.string(),
  role: GrantRole,
  side: GrantSide,
  createdAt: z.string(),
});
export const NewGrant = z.strictObject({
  who: z.string().min(1).max(254),
  role: GrantRole,
  /** When absent, `client` for a new grant, and unchanged for one already made. */
  side: GrantSide.optional(),
});

// ---------------------------------------------------------------------------------------------
// Signing in and who is signed in.

export const Me = z.strictObject({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
});
export type Me = z.infer<typeof Me>;

/** What the server gives the CLI for the session the device flow made. */
export const CliKey = z.strictObject({ key: z.string(), me: Me });
export type CliKey = z.infer<typeof CliKey>;

/** Every error answer. `code` is stable; `message` is for people. */
export const ErrorBody = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    hint: z.string().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** The API's paths, relative to the server's origin. */
export const paths = {
  me: "/api/me",
  cliKey: "/api/cli/key",
  revokeKey: "/api/cli/key",
  decks: "/api/decks",
  deck: (id: string) => `/api/decks/${segment(id)}`,
  versions: (id: string) => `/api/decks/${segment(id)}/versions`,
  promote: (id: string) => `/api/decks/${segment(id)}/promote`,
  comments: (id: string) => `/api/decks/${segment(id)}/comments`,
  replies: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/replies`,
  resolve: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/resolve`,
  reopen: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/reopen`,
  widen: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/widen`,
  grants: (id: string) => `/api/decks/${segment(id)}/grants`,
  grant: (id: string, grant: string) => `/api/decks/${segment(id)}/grants/${segment(grant)}`,
  /** Better Auth's device authorization endpoints, under its base path. */
  deviceCode: "/api/auth/device/code",
  deviceToken: "/api/auth/device/token",
} as const;

/** An ID as one path segment: a `/`, `?`, `#`, or `..` in it cannot reach another path. */
function segment(id: string): string {
  return encodeURIComponent(id);
}

/** The client ID the CLI names itself by in the device flow. */
export const CLI_CLIENT_ID = "dekc";
