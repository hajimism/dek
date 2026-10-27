/**
 * What Playwright 1.64 throws when Chromium will not start without a sandbox, as in a container
 * running as root: its own line first, then Chromium's in the call log.
 */
export const SANDBOX_FAILED = `launch: Target page, context or browser has been closed
Browser logs:
Chromium sandboxing failed!
================================
To avoid the sandboxing issue, do either of the following:
  - (preferred): Configure your environment to support sandboxing
  - (alternative): Launch Chromium without sandbox using 'chromiumSandbox: false' option
================================

Call log:
  - <launching> /root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-linux/headless_shell --disable-field-trial-config --headless --hide-scrollbars --mute-audio --remote-debugging-pipe --no-startup-window
  - <launched> pid=7
  - [pid=7][err] [1027/000000.000000:FATAL:zygote_host_impl_linux.cc(132)] Running as root without --no-sandbox is not supported. See https://crbug.com/638180.
  - [pid=7] <process did exit: exitCode=1, signal=null>`;

/** Chromium's own words in SANDBOX_FAILED, as dek reports them. */
export const SANDBOX_REASON =
  "Running as root without --no-sandbox is not supported. See https://crbug.com/638180.";

/**
 * A launch that failed in words dek does not know: the zygote's check that follows a blocked
 * namespace, with nothing before it said.
 */
export const ZYGOTE_FAILED = `launch: Target page, context or browser has been closed
Browser logs:
[pid=7][err] [1027/000000.000000:FATAL:zygote_host_impl_linux.cc(224)] Check failed: ReceiveFixedMessage(fds[0], kZygoteBootMessage, sizeof(kZygoteBootMessage), &boot_pid).
Call log:
  - <launching> /home/me/.cache/ms-playwright/chromium_headless_shell-1248/chrome-linux/headless_shell --disable-field-trial-config --headless --remote-debugging-pipe --no-startup-window
  - <launched> pid=7
  - [pid=7][err] [1027/000000.000000:FATAL:zygote_host_impl_linux.cc(224)] Check failed: ReceiveFixedMessage(fds[0], kZygoteBootMessage, sizeof(kZygoteBootMessage), &boot_pid).
  - [pid=7] <process did exit: exitCode=null, signal=SIGTRAP>`;

/** Chromium's own words in ZYGOTE_FAILED, as dek reports them. */
export const ZYGOTE_REASON =
  "Check failed: ReceiveFixedMessage(fds[0], kZygoteBootMessage, sizeof(kZygoteBootMessage), &boot_pid).";

/** What Playwright throws when Chromium is not installed: nothing to do with the sandbox. */
export const CHROMIUM_MISSING =
  "launch: Failed to launch chromium because executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-linux/headless_shell";
