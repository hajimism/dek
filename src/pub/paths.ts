// The dek.pub API's paths, which `dekc pub` and dek.pub's own pages call. Without zod, so a page
// can call them without the 25 kB the protocol's shapes would add to it; `protocol.ts` exports
// them too.

/** The API's paths, relative to the server's origin. */
export const paths = {
  me: "/api/me",
  myHandle: "/api/me/handle",
  myLinks: "/api/me/links",
  myKeys: "/api/me/keys",
  myKey: (id: string) => `/api/me/keys/${segment(id)}`,
  /** Who may sign up, as an operator lists, adds and removes them; a 404 to anyone else. */
  invites: "/api/invites",
  invite: (id: string) => `/api/invites/${segment(id)}`,
  handle: (handle: string) => `/api/handles/${segment(handle)}`,
  talksOf: (handle: string) => `/api/people/${segment(handle)}/talks`,
  /** One talk by its URL's handle and slug, as its owner or an operator manages it. */
  talk: (handle: string, slug: string) => `/api/people/${segment(handle)}/talks/${segment(slug)}`,
  cliKey: "/api/cli/key",
  revokeKey: "/api/cli/key",
  decks: "/api/decks",
  deck: (id: string) => `/api/decks/${segment(id)}`,
  versions: (id: string) => `/api/decks/${segment(id)}/versions`,
  comments: (id: string) => `/api/decks/${segment(id)}/comments`,
  replies: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/replies`,
  resolve: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/resolve`,
  reopen: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/reopen`,
  widen: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/comments/${segment(comment)}/widen`,
  mute: (id: string) => `/api/decks/${segment(id)}/mute`,
  publicComments: (id: string) => `/api/decks/${segment(id)}/public-comments`,
  publicComment: (id: string, comment: string) =>
    `/api/decks/${segment(id)}/public-comments/${segment(comment)}`,
  like: (id: string) => `/api/decks/${segment(id)}/like`,
  grants: (id: string) => `/api/decks/${segment(id)}/grants`,
  grant: (id: string, grant: string) => `/api/decks/${segment(id)}/grants/${segment(grant)}`,
  /** Better Auth's device authorization endpoints, under its base path. */
  deviceCode: "/api/auth/device/code",
  deviceToken: "/api/auth/device/token",
} as const;

/** A profile's page path on dek.pub, `/@handle`. */
export function profilePath(handle: string): string {
  return `/@${handle}`;
}

/** A talk's page path on dek.pub, `/@handle/slug`. */
export function talkPath(handle: string, slug: string): string {
  return `${profilePath(handle)}/${slug}`;
}

/** Matches a talk's page path, `/@handle/slug`, with an optional trailing slash. */
export const TALK_PATH = /^\/@([a-z0-9-]+)\/([a-z0-9-]+)\/?$/i;

/** An ID as one path segment: a `/`, `?`, `#`, or `..` in it cannot reach another path. */
function segment(id: string): string {
  return encodeURIComponent(id);
}
