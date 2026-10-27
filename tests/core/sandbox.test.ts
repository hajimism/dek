import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { importPlaywright, playwrightResolved } from "../../src/core/playwright.ts";
import { chromiumFailure, launchFailure, sandboxMode } from "../../src/core/sandbox.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";
import {
  CHROMIUM_MISSING,
  SANDBOX_FAILED,
  SANDBOX_REASON,
  ZYGOTE_FAILED,
  ZYGOTE_REASON,
} from "../helpers/sandbox.ts";

describe("launchFailure", () => {
  test("reads Chromium's own words for the sandbox from the call log of Playwright's error", () => {
    expect(launchFailure(new Error(SANDBOX_FAILED))).toBe(SANDBOX_REASON);
  });

  test("takes Chromium's first line of error where it names no sandbox", () => {
    expect(launchFailure(new Error(ZYGOTE_FAILED))).toBe(ZYGOTE_REASON);
  });

  test("takes the first line of Playwright's error where Chromium said nothing", () => {
    expect(launchFailure(new Error(CHROMIUM_MISSING))).toBe(CHROMIUM_MISSING);
    expect(chromiumFailure(new Error(CHROMIUM_MISSING))).toBeUndefined();
  });

  test("keeps Chromium's pointer to the AppArmor rule, and no more than fits", () => {
    expect(
      launchFailure(
        new Error(
          "  - [pid=7][err] [1027/000000.000000:FATAL:zygote_host_impl_linux.cc(128)] No usable sandbox! If you are running on Ubuntu 23.10+ or another Linux distro that has disabled unprivileged user namespaces with AppArmor, see https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md. Otherwise see https://chromium.googlesource.com/chromium/src/+/main/docs/linux/suid_sandbox_development.md for more information on developing with the (older) SUID sandbox. If you want to live dangerously and need an immediate workaround, you can try using --no-sandbox.",
        ),
      ),
    ).toBe(
      "No usable sandbox! If you are running on Ubuntu 23.10+ or another Linux distro that has disabled unprivileged user namespaces with AppArmor, see https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md.",
    );
  });

  test("ends no sentence inside parentheses", () => {
    expect(
      launchFailure(
        new Error(
          "[pid=7][err] [1027/000000.000000:FATAL:zygote_host_impl_linux.cc(201)] Check failed: real_pid > 1 (0 vs. 1)Received invalid process ID for zygote; kernel might be too old? See crbug.com/357670 or try using --no-sandbox to workaround.",
        ),
      ),
    ).toBe(
      "Check failed: real_pid > 1 (0 vs. 1)Received invalid process ID for zygote; kernel might be too old? See crbug.com/357670 or try using --no-sandbox to workaround.",
    );
  });

  test("never quotes Playwright's own advice, nor the command line it launched", () => {
    const said = launchFailure(new Error(SANDBOX_FAILED));
    expect(said).not.toContain("chromiumSandbox");
    expect(said).not.toContain("--disable-field-trial-config");
  });

  // Playwright words the failure itself; a release that words it otherwise must not slip past.
  test.skipIf(!playwrightResolved() || process.platform === "win32")(
    "reads what the installed Playwright says when Chromium fails to start",
    async () => {
      await withTempDir(async (dir) => {
        const { chromium } = await importPlaywright();
        const failure = async (stderr: string): Promise<unknown> => {
          const fake = join(dir, `chrome-${stderr.length}`);
          await writeFile(fake, `#!/bin/sh\necho '${stderr}' >&2\nexit 1\n`, { mode: 0o755 });
          return chromium
            .launch({ headless: true, chromiumSandbox: true, executablePath: fake })
            .then(
              () => undefined,
              (error: unknown) => error,
            );
        };
        expect(
          launchFailure(
            await failure(
              "[1027/000000.000000:FATAL:zygote_host_impl_linux.cc(132)] Running as root without --no-sandbox is not supported. See https://crbug.com/638180.",
            ),
          ),
        ).toBe(SANDBOX_REASON);
        expect(
          launchFailure(
            await failure(
              "chrome: error while loading shared libraries: libnss3.so: cannot open shared object file",
            ),
          ),
        ).toBe(
          "chrome: error while loading shared libraries: libnss3.so: cannot open shared object file",
        );
      });
    },
  );
});

describe("sandboxMode", () => {
  test("requires the sandbox for a ref's pages, and prefers it for the user's own", async () => {
    await withEnv({ DEK_ALLOW_UNSANDBOXED: undefined }, async () => {
      expect(sandboxMode(true)).toBe("required");
      expect(sandboxMode(false)).toBe("preferred");
    });
  });

  test("lets a ref's pages go without it only once DEK_ALLOW_UNSANDBOXED is 1", async () => {
    for (const [value, mode] of [
      ["1", "preferred"],
      ["0", "required"],
      ["true", "required"],
      ["", "required"],
    ] as const) {
      await withEnv({ DEK_ALLOW_UNSANDBOXED: value }, async () => {
        expect(sandboxMode(true)).toBe(mode);
      });
    }
  });
});
