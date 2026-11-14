// What every answer from the app's origin carries. No page of dek.pub is ever framed, a page
// opened from a deck cannot reach back into the tab that opened it, a browser that has once reached
// dek.pub over HTTPS keeps to it, and no page may use a camera, a microphone or the like. Full
// screen is left to its default, since the talk page and the deck it frames both ask for it.

/** A year, as RFC 6797 counts it; no `preload`, which only a request to the browsers adds. */
const HSTS = "max-age=31536000; includeSubDomains";

const PERMISSIONS = "camera=(), microphone=(), geolocation=(), usb=(), payment=()";

export function applyAppHeaders(headers: Headers, url: URL): void {
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", PERMISSIONS);
  if (url.protocol === "https:") {
    headers.set("strict-transport-security", HSTS);
  }
  if (!headers.has("content-security-policy")) {
    headers.set(
      "content-security-policy",
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
  }
}
