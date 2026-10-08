# 13. Compile the player apart for the dev server

Date: 2026-10-08

## Status

Accepted

## Context

Every page dek writes embeds one player, compiled from `src/runtime/browser.ts`: the dev server's pages, `dekc build`, `dekc video`, and the pages `shot` draws. Part of that player only works with the dev server behind it:

- the position socket that keeps the presenter, the audience, a phone on `--remote`, `dekc goto`, and `dekc current` on one beat, and carries the laser;
- the live updates (`window.dekLive`) the event stream feeds when a slide, the theme, or the diagnostics change;
- the marks the presenter bar keeps on beats to rewrite;
- rehearse mode, which fetches `voice/timeline.json` and the audio from the server.

A built file carried all of it and switched it off at run time: the socket only dialed when `<body>` said `data-live="true"`, marks only started when the page had the mark button, and `?rehearse` on a built file fetched paths no static host serves. That was about a fifth of the player, roughly 7 KB minified and 2.4 KB gzipped, in every built file.

[ADR 5](0005-annotate-slide-elements-on-the-dev-page-and-hand-the-notes-over-as-text.md) already compiled annotate mode apart for the same reason.

## Decision

**The player is compiled from two entries.** `src/runtime/start.ts` holds the player as `startPlayer`, which takes the dev server's line as an argument and has no import of it. `src/runtime/browser.ts` calls it without one; `src/runtime/browser-live.ts` passes `createDevLine` from `src/runtime/dev-line.ts`, which owns the socket, the marks, the rehearsal, and `window.dekLive`. `playerScript()` compiles the first, for a build, a video, and a shot; `livePlayerScript()` compiles the second, for the dev server's pages. What leaves the built player out is the import graph, not a compile-time flag or dead-code elimination: its entry never imports `dev-line.ts`.

- The navigator no longer opens the socket. It takes `connect`, a function that opens one, in place of `socketUrl`, so `socket.ts` is imported only by `dev-line.ts`.
- The deck control's rehearsal is optional; without one, a move goes straight to the navigator and Space is left alone.
- `data-live` is gone from `<body>` and `live` from `PageConfig`. Which player a page embeds says whether it is the dev server's.

What stays in both: the `BroadcastChannel` between windows, which keeps a built file's presenter view on the audience's beat, the laser between those windows, and `window.dekGo` and `window.dekMotion`, which the video recorder and morph shots drive.

## Consequences

The player a built file embeds goes from 30.7 KB to 23.9 KB minified, and from 10.8 KB to 8.4 KB gzipped. A built file has no code that reaches for a server, rather than code told not to.

The dev server compiles one more script when it starts, and anything that renders a dev page has to embed `livePlayerScript()`. A dev page given the built player would play, with no socket, no live updates, no marks, and no rehearsal; the dev server tests check that its pages embed the live one.

Tests of the socket, live updates, marks, and rehearse mode mount the dev server's page (`mountPlayer(…, { live: true })`), as the dev server serves it.
