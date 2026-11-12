<script lang="ts">
  import { untrack } from "svelte";
  import { isCompleteUserCode, normalizeUserCode } from "../src/lib/device-code.ts";
  import { useApp } from "../src/ui/app.ts";
  import Avatar from "../src/ui/Avatar.svelte";
  import Button from "../src/ui/Button.svelte";
  import { decide, type DeviceProblem, lookUp } from "../src/ui/device-api.ts";
  import DeviceCodeInput from "../src/ui/DeviceCodeInput.svelte";
  import Icon from "../src/ui/Icon.svelte";
  import type { Props } from "./device.server";

  let { code: initial }: Props = $props();
  const { shared, t } = useApp();

  // The code a link from the CLI carries fills the field; the page is not reloaded with another.
  let code = $state(untrack(() => initial));
  // A code that came in the link, not typed, is where phishing starts: someone sends a link with
  // their own code, and whoever allows it lets them publish as themselves. So such a code needs
  // the reader to say their own terminal shows it.
  const fromLink = untrack(() => initial !== "");
  let matches = $state(false);
  let mustMatch = $state(false);
  let step: "enter" | "confirm" | "done" | "denied" = $state("enter");
  let problem: DeviceProblem | "short" | null = $state(null);
  let busy: "look" | "allow" | "deny" | null = $state(null);

  const messages: Record<DeviceProblem | "short", Parameters<typeof t>[0]> = {
    invalid: "device.invalid",
    expired: "device.expired",
    used: "device.used",
    offline: "common.offline",
    short: "device.short",
  };

  function next(): string {
    const query = code ? `?user_code=${encodeURIComponent(normalizeUserCode(code))}` : "";
    return `/signin?next=${encodeURIComponent(`/device${query}`)}`;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!isCompleteUserCode(code)) {
      problem = "short";
      return;
    }
    if (fromLink && normalizeUserCode(code) === normalizeUserCode(initial) && !matches) {
      mustMatch = true;
      document.getElementById("device-matches")?.focus();
      return;
    }
    busy = "look";
    problem = null;
    const result = await lookUp(normalizeUserCode(code));
    busy = null;
    if (result.ok) {
      step = "confirm";
    } else {
      problem = result.problem;
    }
  }

  async function answer(allow: boolean) {
    busy = allow ? "allow" : "deny";
    const result = await decide(normalizeUserCode(code), allow);
    busy = null;
    if (result.ok) {
      step = allow ? "done" : "denied";
    } else {
      problem = result.problem;
      step = "enter";
    }
  }
</script>

<div class="page">
  <section class="card" aria-labelledby="device-title" aria-live="polite">
    {#if step === "done"}
      <span class="badge ok"><Icon name="check" size={24} /></span>
      <h1 id="device-title">{t("device.done")}</h1>
      <p class="sub">{t("device.doneHint")}</p>
    {:else if step === "denied"}
      <span class="badge"><Icon name="x" size={24} /></span>
      <h1 id="device-title">{t("device.denied")}</h1>
      <p class="sub">{t("device.deniedHint")}</p>
    {:else if step === "confirm" && shared.viewer}
      <span class="badge term"><Icon name="terminal" size={22} /></span>
      <h1 id="device-title">{t("device.confirm", { handle: shared.viewer.handle })}</h1>
      <div class="who">
        <Avatar name={shared.viewer.name} image={shared.viewer.image} size={28} />
        <span><strong>{shared.viewer.name}</strong> <span class="muted">@{shared.viewer.handle}</span></span>
      </div>
      <p class="sub">{t("device.confirmBody")}</p>
      <ul class="scopes">
        <li><Icon name="arrow-up-right" size={14} />{t("device.scope.publish")}</li>
        <li><Icon name="globe" size={14} />{t("device.scope.share")}</li>
        <li><Icon name="message" size={14} />{t("device.scope.comments")}</li>
      </ul>
      <p class="code-line">{t("device.code", { code })}</p>
      <p class="confirm-warning"><Icon name="alert" size={14} />{t("device.confirmWarning")}</p>
      <div class="buttons">
        <Button variant="ghost" size="lg" loading={busy === "deny"} disabled={busy !== null} onclick={() => answer(false)}>{t("device.deny")}</Button>
        <Button variant="primary" size="lg" loading={busy === "allow"} disabled={busy !== null} onclick={() => answer(true)}>{t("device.allow")}</Button>
      </div>
    {:else}
      <span class="badge term"><Icon name="terminal" size={22} /></span>
      <h1 id="device-title">{t("device.title")}</h1>
      {#if shared.viewer}
        <p class="sub">{t("device.prompt")}</p>
        <form method="get" onsubmit={submit} novalidate>
          {#if fromLink}
            <div class="warning" role="note">
              <Icon name="alert" size={16} />
              <div>
                <p class="warning-title">{t("device.fromLink")}</p>
                <p>{t("device.fromLinkBody")}</p>
              </div>
            </div>
          {/if}
          <DeviceCodeInput bind:value={code} label={t("device.codeLabel")} error={problem ? t(messages[problem]) : ""} />
          {#if fromLink && normalizeUserCode(code) === normalizeUserCode(initial)}
            <label class="check" class:invalid={mustMatch && !matches}>
              <input
                id="device-matches"
                type="checkbox"
                bind:checked={matches}
                aria-describedby={mustMatch && !matches ? "device-matches-error" : undefined}
              />
              <span>{t("device.matches", { code })}</span>
            </label>
            {#if mustMatch && !matches}
              <p class="check-error" id="device-matches-error" role="alert">{t("device.mustMatch")}</p>
            {/if}
          {/if}
          <Button variant="primary" size="lg" full type="submit" loading={busy === "look"}>{t("device.continue")}</Button>
        </form>
      {:else}
        <p class="sub">{t("device.signedOut")}</p>
        <Button variant="neutral" size="lg" full icon="github" href={next()}>{t("signin.github")}</Button>
      {/if}
    {/if}
  </section>
</div>

<style>
  .page {
    display: flex;
    justify-content: center;
    padding: 15vh var(--page-gutter) var(--space-16);
  }
  .card {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .badge {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-subtle);
    color: var(--text-muted);
  }
  .badge.ok {
    border-color: transparent;
    background: var(--success-subtle);
    color: var(--success);
  }
  .badge.term {
    color: var(--text);
  }
  h1 {
    font-size: var(--text-xl);
  }
  .sub {
    color: var(--text-muted);
    font-size: var(--text-md);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: var(--space-2);
  }
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .muted {
    color: var(--text-muted);
  }
  .scopes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .scopes li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .scopes :global(svg) {
    color: var(--text-faint);
  }
  .warning {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--warning);
    border-radius: var(--radius-md);
    background: var(--warning-subtle);
    color: var(--warning);
    font-size: var(--text-sm);
  }
  .warning :global(svg) {
    margin-top: 2px;
    flex-shrink: 0;
  }
  .warning-title {
    margin-bottom: 2px;
    font-weight: var(--weight-semibold);
  }
  .check {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-size: var(--text-md);
    cursor: pointer;
  }
  .check.invalid {
    border-color: var(--danger);
  }
  .check input {
    width: 18px;
    height: 18px;
    margin: 1px 0 0;
    accent-color: var(--accent);
    flex-shrink: 0;
  }
  .check span {
    font-variant-numeric: tabular-nums;
  }
  .check-error {
    margin-top: calc(-1 * var(--space-2));
    color: var(--danger);
    font-size: var(--text-sm);
  }
  .confirm-warning {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--warning);
    font-size: var(--text-sm);
  }
  .confirm-warning :global(svg) {
    margin-top: 3px;
    flex-shrink: 0;
  }
  .code-line {
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
</style>
