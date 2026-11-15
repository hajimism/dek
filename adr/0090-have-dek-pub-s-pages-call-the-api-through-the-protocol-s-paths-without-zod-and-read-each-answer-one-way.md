# 90. Have dek.pub's pages call the API through the protocol's paths without zod, and read each answer one way

Date: 2026-11-15

## Status

Accepted

Amends [50. Organise dek.pub's code by the model a person deals with](0050-organise-dek-pub-s-code-by-the-model-a-person-deals-with.md)

## Context

The protocol, `src/pub/protocol.ts`, holds the API's paths beside its shapes, and `dekc pub` calls them from there. The module imports zod, and nothing a page sends to the browser may import zod, which would add 25 kB to it (ADR 50). So dek.pub's pages wrote 19 paths out by hand. Some passed IDs through `encodeURIComponent` and some did not, and the protocol's `paths` was used by the CLI alone.

How a page read a call's answer was written out as often: two tables between the API's error codes and a page's problems, one keyed by problem and one by code; three types of a failed call; five endings of a `switch` that said "dek.pub could not be reached" or put the server's message under the page's line; and four changes shown before their call answered, each putting back what was shown when the call failed.

## Decision

**The paths are in `src/pub/paths.ts`, which imports nothing.** `protocol.ts` exports them from there too, so `dekc pub` is unchanged. Pages and their calls take each path from `paths`, which puts every ID through `encodeURIComponent`. Better Auth's own endpoints, which the protocol does not name, stay written out where they are called.

**The protocol's files are no layer's.** `tests/unit/boundaries.test.ts` lets any file import `protocol.ts`, `paths.ts` and `thread.ts` from the repository's `src/pub/`, named one by one, as it let them import `protocol.ts`; `zodInTheBrowser` still follows a component's imports into it, so a page that reaches `protocol.ts` for a value still fails it.

**A page reads a call one way, through `src/common/ui/call.ts`:**

- `called(call, codes)` answers `{ ok: true, value }` or `{ ok: false, problem, message }`. The problem is the one whose code in `codes` the error carries, `offline` when dek.pub was not reached, or else `failed`. `codes` maps each problem to its code, the table the server answers with, so both sides read one: `LINK_CODES`, `NAME_CODES`, and `HANDLE_CODES`, which replaces the handle page's table keyed by code. The invitation list, which only an operator sees, passes no table: its server's message names the entry it could not take, and the page shows that message as it is.
- `failedText(t, failed)` says what a page says of a failure it has no words of its own for; `failureText(t, error)` says it of a thrown error.
- `showFirst(shown, next, call, failed)` shows a change at once, shows what the call answers, and puts back what the server last answered when it fails. Of changes to one value made before the first answers, such as a reader clicking mute and then unmute, an answer or a failure shows nothing while a newer change still waits, so a late answer never puts back a value the reader has already changed. Saving a deck's settings, removing a grant, muting a deck's mail and liking a talk use it.

## Consequences

- An ID in a path is encoded on every page as the CLI encodes it. A page cannot write a path the API does not have without the protocol knowing it.
- A new call on a page is one `called` with its codes table, and a new problem is a key in that table, which the server's `ApiError` takes its code from.
- `showFirst` takes a getter and a setter, as a component's `$state` cannot be passed by reference, made once for each value: it knows the changes to one value apart by that object. A change that touches two values at once still needs code of its own.
- The manage page's sharing form keeps its own reading of a failure, which shows the server's hint under its field.
