<script lang="ts">
  // The CLI keys a person holds, one row each: what it is called, when it was made, last used and
  // runs out, and a button that revokes it at once. Revoking them all asks first.
  import { untrack } from "svelte";
  import type { CliKeyInfo } from "../../../../../../../../src/pub/protocol.ts";
  import { absoluteTime, formatDate, relativeTime } from "../../../../../common/i18n.ts";
  import Button from "../../../../../common/ui/button.svelte";
  import { now as currentTime } from "../../../../../common/ui/clock.svelte.ts";
  import Dialog from "../../../../../common/ui/dialog.svelte";
  import Icon from "../../../../../common/ui/icon.svelte";
  import { toast } from "../../../../../common/ui/toast.svelte.ts";
  import { useApp } from "../../../../../shell/use-app.ts";
  import { type RevokeFailure, revokeKeys } from "../settings-api.ts";

  let { keys: initial }: { keys: CliKeyInfo[] } = $props();
  const { shared, lang, t } = useApp();

  let keys = $state(untrack(() => initial));
  /** The key being revoked, or "all"; nothing else can be revoked meanwhile. */
  let revoking: string | null = $state(null);
  let problem: string | null = $state(null);
  let confirmAll = $state(false);

  function failureText(failure: RevokeFailure): string {
    return failure.problem === "offline"
      ? t("common.offline")
      : t("common.error", { message: failure.message });
  }

  async function revoke(id?: string) {
    if (revoking !== null) {
      return;
    }
    confirmAll = false;
    revoking = id ?? "all";
    const result = await revokeKeys(id);
    revoking = null;
    if (!result.ok) {
      problem = failureText(result);
      return;
    }
    problem = null;
    keys = id === undefined ? [] : keys.filter((key) => key.id !== id);
    toast(t(id === undefined ? "settings.keys.allRevoked" : "settings.keys.revoked"));
  }
</script>

<p class="hint">{t("settings.keys.hint")}</p>
{#if keys.length === 0}
  <p class="none">{t("settings.keys.none")}</p>
{:else}
  <ul class="keys">
    {#each keys as key (key.id)}
      {@const name = key.name ?? "dekc"}
      <li class="key">
        <div class="about">
          <p class="name">{name}</p>
          <p class="dates">
            <span>{t("settings.keys.made", { date: formatDate(lang, key.createdAt) })}</span>
            {#if key.lastUsedAt}
              <time datetime={key.lastUsedAt} title={absoluteTime(lang, key.lastUsedAt)}
                >{t("settings.keys.used", { when: relativeTime(lang, key.lastUsedAt, currentTime(shared.now)) })}</time
              >
            {:else}
              <span>{t("settings.keys.unused")}</span>
            {/if}
            {#if key.expiresAt}
              <span>{t("settings.keys.expires", { date: formatDate(lang, key.expiresAt) })}</span>
            {/if}
          </p>
        </div>
        <Button
          variant="danger-quiet"
          size="sm"
          loading={revoking === key.id}
          disabled={revoking !== null}
          aria-label={t("settings.keys.revokeOne", { name })}
          onclick={() => revoke(key.id)}>{t("settings.keys.revoke")}</Button
        >
      </li>
    {/each}
  </ul>
{/if}
{#if problem}
  <p class="hint problem" aria-live="polite"><Icon name="alert" size={14} />{problem}</p>
{/if}
{#if keys.length > 0}
  <div class="actions">
    <Button
      variant="danger-quiet"
      loading={revoking === "all"}
      disabled={revoking !== null}
      onclick={() => (confirmAll = true)}>{t("settings.keys.revokeAll")}</Button
    >
  </div>
{/if}

<Dialog bind:open={confirmAll} title={t("settings.keys.allTitle")}>
  <p>{t("settings.keys.allBody")}</p>
  {#snippet actions()}
    <Button variant="secondary" autofocus onclick={() => (confirmAll = false)}>{t("common.cancel")}</Button>
    <Button variant="danger" onclick={() => revoke()}>{t("settings.keys.allConfirm")}</Button>
  {/snippet}
</Dialog>

<style>
  .hint,
  .none {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }
  .hint :global(svg) {
    margin-right: 6px;
    vertical-align: -2px;
  }
  .hint.problem {
    color: var(--danger);
  }
  /* Japanese is set flush on both sides, as it is in print. */
  .hint:lang(ja) {
    text-align: justify;
    text-autospace: ideograph-alpha ideograph-numeric;
  }
  .keys {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .key {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--border);
  }
  .key:last-child {
    border-bottom: 1px solid var(--border);
  }
  .about {
    min-width: 0;
  }
  .name {
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--text-base);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dates {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }
  .actions {
    display: flex;
  }
</style>
