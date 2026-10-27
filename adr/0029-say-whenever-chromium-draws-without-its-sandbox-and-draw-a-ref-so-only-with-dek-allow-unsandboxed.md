# 29. Say whenever Chromium draws without its sandbox, and draw a ref so only with DEK_ALLOW_UNSANDBOXED

Date: 2026-10-27

## Status

Accepted

Amends [28. Let a project's code run only as a page, a ref's only in an offline sandbox, and the dev server act only for its own pages](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md)

## Context

[ADR 28](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md) says a ref's slide scripts run only in `shot`, "in Chromium with its sandbox on where it starts and the network off" (part 2), and leaves the case where it does not start to this record (part 7). `launchChromium` in `src/core/playwright.ts` asked for the sandbox and, when that launch failed for any reason, launched again without it. Its comment gave the intent: "Where the sandbox cannot start, as in a container running as root, it runs without one rather than not at all." Three things followed:

- **Nobody was told.** In a container running as root, every page dek drew, a ref's included, ran in a renderer with no sandbox, and neither the user nor their agent could learn it from the output.
- **A ref's code ran without the sandbox, unasked.** The sandbox was turned on for `dekc shot <ref>` ([ADR 12](0012-take-github-tokens-and-dek-variables-only-from-what-the-user-sets.md)): a ref's slide scripts are someone else's code. The fallback dropped it in exactly the places where the user had not set one up, without asking.
- **A second failure hid the first.** Where Chromium did not start without the sandbox either, as when it was not installed, only the second failure was reported, and the parent's hint keeps the first 200 characters of a worker's stderr, which Playwright's command line alone fills.

No test showed the sandbox was on (ADR 28, open item 6).

What Chromium and Playwright say, from runs on 2026-10-27 with Playwright 1.64 and a stand-in Chromium that printed Chromium's messages: when Chromium's startup log holds `No usable sandbox!`, `crbug.com/638180` (running as root), or `crbug.com/357670` (Chromium's check that the zygote got a process ID, "Received invalid process ID for zygote; kernel might be too old?"), Playwright puts `Chromium sandboxing failed!` and its advice to launch with `chromiumSandbox: false` in its place, and Chromium's own line stays in the call log after it. Ubuntu 23.10 and later keep a program without an AppArmor profile from making user namespaces, and Playwright's headless shell has none, so Chromium says `No usable sandbox!` there, with a pointer to Chromium's page on the rule. GitHub's `ubuntu-24.04` runners set `kernel.apparmor_restrict_unprivileged_userns=1`, so every page dek's CI drew was drawn without the sandbox, unsaid. A sandbox blocked otherwise can say nothing dek knows: the SUID helper's `Failed to move to new namespace … errno = Operation not permitted` comes with a `FATAL … Check failed: ReceiveFixedMessage(…)`. A missing Chromium is `Failed to launch chromium because executable doesn't exist at …`. On macOS, a renderer Chromium runs in its sandbox has `--seatbelt-client` on its command line, and one it runs without has `--no-sandbox`, as on Linux.

One more fact bears on where the decision is read: in Bun 1.4.3, a process dek starts without naming its environment gets the environment dek started in, not `process.env` as dek has changed it since. A `DEK_` variable that a `.env` set and dek removed (ADR 12) still reaches the Playwright worker.

## Decision

**dek says, every time, when Chromium drew without its sandbox.**

- The first time in a run that a worker reports it, dek writes on stderr `warning: Chromium drew without its sandbox, which did not start here: <what Chromium said>`, and a `help:` line for what it said: as root, run dekc as a user other than root; with `No usable sandbox!`, a blocked namespace, or the zygote's check, let Chromium make user namespaces, on Ubuntu 23.10 and later with `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` or an AppArmor profile, in a container with a seccomp profile that allows them; otherwise both. The line ends with how to accept drawing without it, `DEK_ALLOW_UNSANDBOXED=1`. Once a run, since `lint --visual` starts a worker or two per deck; the dev server, which runs until stopped, says it once, pass after pass.
- Every command that draws, `check`, `lint`, `shot`, `build`, `pdf`, `pptx`, and `video`, carries `unsandboxed: { reason, hint }` in its `--json` when it drew so, and leaves it out otherwise, as `skipped` is absent when every check ran. It is not a `skipped` entry: the pages were drawn and measured, and the findings stand. The warning goes to stderr as Chromium draws, in either mode, so a run that fails later has still said it.
- `reason` is what Chromium said: its words for a sandbox that cannot start (`No usable sandbox!`, `Running as root without --no-sandbox`, the SUID sandbox helper's, `Failed to move to new namespace`, `Received invalid process ID for zygote`), or Playwright's `Chromium sandboxing failed!` where Chromium's are not in the error; else Chromium's first `[err]` or `FATAL` line; else the first line of Playwright's error. It keeps whole sentences up to 280 characters, the first however long, and no sentence ends inside parentheses, so `(0 vs. 1)` does not cut it and Chromium's pointer to the AppArmor rule stays. Never Playwright's command line, or its advice to launch with `chromiumSandbox: false`.

**A ref is drawn only in the sandbox unless the user sets `DEK_ALLOW_UNSANDBOXED=1`.**

- `shot` of a ref asks its worker to require the sandbox. A worker told so, told anything but "preferred", or told nothing, launches nothing more when its launch with the sandbox fails, whatever the failure: it draws nothing and answers why, and dek fails with `Chromium did not start with its sandbox here, and a ref is drawn only inside it: <reason>`. The hint is the same way to have the sandbox, after the way to install Chromium when the failure names no sandbox, and ends with the user's decision, not an instruction: if you accept running this ref's slide scripts without the sandbox, set `DEK_ALLOW_UNSANDBOXED=1` and run again. `shot` is the only command that draws a ref (ADR 28, part 2); a command that comes to draw one passes `refPlaywrightRunner`.
- With the variable set, a ref is drawn as the project's own decks are, the network still off, and dek still warns on every run and records it: a ref is the case the warning is for.

**For the project's own decks, a failed launch with the sandbox is tried once without it, whatever the failure, and said.** Their scripts are the deck author's (ADR 28, part 1), and the same pages run in the user's browser anyway. Knowing Chromium's words only chooses the reason and the hint, so a failure in words dek does not know still draws, with the warning. When Chromium starts neither way, dek fails with `Chromium did not start, with its sandbox or without: <the second failure>`, whose hint is the worker's own, how to install Playwright's Chromium, and what Chromium said with the sandbox when it said something else. `DEK_ALLOW_UNSANDBOXED=1` quiets the warning for these decks, so a container image that sets it is not told on every run what its owner already accepted; `--json` still records it.

**A worker that fails says what Chromium said.** Its stderr, of which the parent's hint keeps the start, is Chromium's first line of error when the failure holds one, not Playwright's message, which opens with the command line it launched.

**The variable** is `DEK_ALLOW_UNSANDBOXED`, and only `1` sets it. dek reads it in its own process, never in a worker, which a `.env` could still reach; ADR 12's handling of a `.env` covers it like every `DEK_` variable. It does not turn the sandbox off: dek asks for it first wherever it runs.

`src/core/sandbox.ts` holds the variable, the reading of the launch's error, what the worker is told and answers, and the warning and the record; `launchChromium` and `runPlaywrightWorker` in `src/core/playwright.ts` launch, refuse, and answer; `src/cli/main.ts` clears the record as a run starts and puts it in the result. A module-level record, read and cleared once a run, keeps every command that draws from passing the fact up through each function between it and the worker. CI's check job and the Pages build set `kernel.apparmor_restrict_unprivileged_userns=0` before they draw, so the sandbox starts there too.

Shown by `tests/core/playwright.test.ts` ("launchChromium", with a stand-in Chromium: with the sandbox, without it after a failure dek knows and one it does not, nothing more where it is required, both failures, and any mode but "preferred" taken as required; "drawing where Chromium's sandbox cannot start"), `tests/core/sandbox.test.ts` (the reason, against the installed Playwright too), `tests/cli/shot.test.ts` ("dekc shot where Chromium's sandbox cannot start": the project's deck in `--json`, held to the contract, and in text, a ref, a ref with the variable, the variable's quiet, words dek does not know, and Chromium starting neither way), `tests/cli/lint.test.ts` (once a run), and `tests/server/watch.test.ts` (once on the dev server's stderr, over two passes). The stand-in worker, `tests/helpers/fake-playwright-sandboxless.ts`, runs dek's own worker loop around a Chromium whose sandbox never starts.

This closes ADR 28's open item 1 and the sandbox half of open item 6: `tests/core/playwright-browser.test.ts` ("Chromium's sandbox") reads the command line of every renderer of a Chromium `launchChromium` started and finds no `--no-sandbox`, and finds it in one launched as Playwright leaves it.

## Consequences

Where the sandbox starts, nothing changes. Where it does not, the user and their agent learn it on every run, with what Chromium said and what would let the sandbox start, and a ref's scripts no longer run there unless the user said they may.

This is a breaking change in one place: where Chromium's sandbox does not start, `dekc shot <ref>` fails until `DEK_ALLOW_UNSANDBOXED=1` is set. The project's own decks draw as before, now with a warning, and a Chromium that starts neither way is reported with both failures.

The record and the warning are the parent's, so a `DEK_PLAYWRIGHT` or `DEK_VIDEO` worker the user supplies is taken at its word: one that says nothing of the sandbox is reported as drawn in it.

A failure in words dek does not know costs only the help: the project's own decks draw with the general one, and a ref is refused with the way to install Chromium first, since the failure may not be the sandbox's. A test launches the installed Playwright against a stand-in Chromium that prints Chromium's messages, so a Playwright that reports them otherwise fails it.

On CI, the browser test fails wherever the sandbox does not start, which is the finding it is for; without the sysctl step, every GitHub `ubuntu-24.04` run would.

**What was not chosen:**

- **Failing everywhere the sandbox cannot start.** A container running as root is how many CI jobs and dev containers run, and the project's own scripts run in the user's browser in any case; refusing them would stop `lint --visual`, `pdf`, and `video` there for no protection.
- **Trying again without the sandbox only when Chromium's words name it.** A sandbox blocked in words dek does not know, such as the SUID helper's and a blocked namespace's together, would then stop the project's own decks with an error that says nothing they can act on. Knowing the words is worth what it says, not whether dek draws.
- **A flag on every drawing command**, such as `--allow-unsandboxed`. Seven commands and the dev server would take it, an agent would add it to make an error go away, and a container sets what it accepts once, in its environment.
- **Detecting root, or user namespaces, before launching.** Whether the sandbox starts depends on more than the user: AppArmor, seccomp, the SUID helper, the platform. Chromium knows; trying is the only answer that matches it.
- **Reading the variable in the worker.** A worker gets the environment dek started in, `.env` variables dek removed included.
- **A `skipped` entry with a check named `sandbox`.** Nothing was skipped: the pages were drawn and their findings are real, so a reader that treats `skipped` as "not measured" would be misled.
- **The warning in each command's text notes**, beside `skipped`. It would print only once a command succeeded, and never from the dev server.
- **One variable to allow a ref and another to quiet the warning.** Two names for one decision, that drawing without the sandbox is accepted here; a ref still warns either way.
