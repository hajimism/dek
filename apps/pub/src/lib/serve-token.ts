// The tokens the app signs and the serve Worker checks before it hands out a deck that is not
// public, or the speaker's full build. A token names one deck, one version, one build and an
// expiry, and is good for minutes: it rides in an iframe's URL, which can end up in a history.

export type Variant = "full" | "public" | "bare";

export type ServeClaims = {
  deck: string;
  n: number;
  variant: Variant;
  /** Expiry, in seconds since the epoch. */
  exp: number;
};

const VARIANTS: readonly string[] = ["full", "public", "bare"];

export async function signServeToken(secret: string, claims: ServeClaims): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  return `${payload}.${base64url(await hmac(secret, payload))}`;
}

/** The claims of a token this secret signed and that has not expired, else null. */
export async function verifyServeToken(
  secret: string,
  token: string,
  nowSeconds: number,
): Promise<ServeClaims | null> {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) {
    return null;
  }
  const expected = await hmac(secret, payload);
  const given = fromBase64url(signature);
  if (!given || !constantTimeEqual(expected, given)) {
    return null;
  }
  const bytes = fromBase64url(payload);
  if (!bytes) {
    return null;
  }
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!isClaims(claims) || claims.exp <= nowSeconds) {
    return null;
  }
  return claims;
}

function isClaims(value: unknown): value is ServeClaims {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const claims = value as Record<string, unknown>;
  return (
    typeof claims.deck === "string" &&
    Number.isInteger(claims.n) &&
    typeof claims.variant === "string" &&
    VARIANTS.includes(claims.variant) &&
    Number.isInteger(claims.exp)
  );
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) {
    return null;
  }
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
