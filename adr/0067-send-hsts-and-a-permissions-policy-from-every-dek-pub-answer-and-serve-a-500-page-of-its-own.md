# 67. Send HSTS and a permissions policy from every dek.pub answer, and serve a 500 page of its own

Date: 2026-11-14

## Status

Accepted

## Context

Every answer from the app's origin carries `x-frame-options`, `nosniff`, a referrer policy, COOP and a CSP that stops framing (`middleware/02.headers.ts`). The serve Worker's deck pages carry a strict CSP and a permissions policy (ADR 43). Neither origin tells a browser to keep to HTTPS, so a first visit typed as `dek.pub`, or a link written with `http://`, can be taken over on a hostile network before the redirect. The app's pages also leave the camera, the microphone and the like to the browser's defaults, though no page uses them.

When a page throws, Void serves `/500.html` from the assets if there is one, and its own bare page if not. dek.pub had none. Run on `vp dev`, a page that throws answers 500 with every header the middleware sets, so the headers reach error pages already.

A full CSP for the app's pages, with `default-src` and `script-src`, was weighed. Void's page data is an inline JSON script, which a policy does not stop, but the talk page runs an inline listener that must start before the deck loads (`EARLY_LISTENER`), the pages load Google Fonts' stylesheet and fonts, GitHub's avatars and frames from the deck origin, and `vp dev` adds its own client. A policy that lists each needs a hash or a nonce for the listener and a test that opens every page under it, which is more than this change.

## Decision

**Both origins send `strict-transport-security: max-age=31536000; includeSubDomains` on every answer over HTTPS**, and nothing over plain HTTP, so a machine's `localhost` is never pinned. It has no `preload`: that is a request to the browsers that is hard to take back, and waits until the domains are live.

**The app's headers are one function, `applyAppHeaders` in `src/shell/headers.ts`,** that the middleware calls after the page or route has answered, so a unit test reads what every answer carries. It adds `permissions-policy: camera=(), microphone=(), geolocation=(), usb=(), payment=()`. Full screen is left at its default: the talk page asks for it, and so does the deck it frames, through the iframe's `allow="fullscreen"`.

**The serve Worker adds the same HSTS in `handleServe`** around its answer, so its 404, 403 and 405 carry it too.

**`public/500.html` is dek.pub's error page:** static, Japanese then English, `noindex`, with its colours inline and nothing loaded from elsewhere, linking back to `/`. It does not use `i18n.ts`, since a page shown because the app failed should not need the app to render.

**What was not chosen:**

- **A full CSP for the app's pages now.** It needs its own change, with a test that opens every page under it; the frame and base rules stay.
- **HSTS with `preload`.** Not before both domains are registered and have run over HTTPS for a while.
- **A Svelte error page.** Void renders it with the app, which may be what failed.

## Consequences

- `tests/unit/shell.test.ts` checks the app's headers, HSTS over HTTPS only, and the permissions policy; `serve/test/serve.test.ts` checks HSTS on the serve Worker's answers, found or not.
- Once a browser has seen HSTS, `dek.pub` and its subdomains open over HTTPS only for a year; a subdomain that cannot do HTTPS must not be made under `dek.pub`.
- `/500.html` is a static asset, so it is served as it is, without the middleware's headers; it holds no form and no script.
- A full CSP for the app is still to come, listed with what dek.pub does not do yet.
