<script lang="ts">
  // Who may sign up, as an operator sees and changes it (ADR 85): a field that takes one entry or
  // several, then one row to each entry, with who added it and when, and the account made from it.
  // An entry no account was made from can be removed at once; one that was stays.
  import { untrack } from "svelte";
  import type { SignUpInvite } from "../../../../../../../../src/pub/protocol.ts";
  import { formatDate } from "../../../../../common/i18n.ts";
  import Button from "../../../../../common/ui/button.svelte";
  import Icon from "../../../../../common/ui/icon.svelte";
  import { toast } from "../../../../../common/ui/toast.svelte.ts";
  import { useApp } from "../../../../../shell/use-app.ts";
  import {
    type InvitesProblem,
    MAX_INVITES_PER_ADD,
    readInviteEntries,
    splitInviteInput,
  } from "../../../sign-up-invite.ts";
  import { addInvites, type CallFailure, removeInvite } from "../settings-api.ts";

  let { invites: initial }: { invites: SignUpInvite[] } = $props();
  const { lang, t } = useApp();

  let invites = $state(untrack(() => initial));
  let typed = $state("");
  let adding = $state(false);
  /** The entry being removed; nothing else can be removed meanwhile. */
  let removing: string | null = $state(null);
  let problem: string | null = $state(null);

  function problemText(read: InvitesProblem): string {
    switch (read.problem) {
      case "invalid":
        return t("settings.invites.invalid", { entry: read.entry });
      case "empty":
        return t("settings.invites.empty");
      case "too_many":
        return t("settings.invites.too_many", { n: MAX_INVITES_PER_ADD });
    }
  }

  function failureText(failure: CallFailure): string {
    return failure.problem === "offline"
      ? t("common.offline")
      : t("common.error", { message: failure.message });
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (adding) {
      return;
    }
    const read = readInviteEntries(splitInviteInput(typed));
    if (!read.ok) {
      problem = problemText(read);
      return;
    }
    adding = true;
    const result = await addInvites(read.entries);
    adding = false;
    if (!result.ok) {
      problem = failureText(result);
      return;
    }
    problem = null;
    invites = result.invites;
    typed = "";
    toast(t("settings.invites.addedToast"));
  }

  async function remove(id: string) {
    if (removing !== null) {
      return;
    }
    removing = id;
    const result = await removeInvite(id);
    removing = null;
    if (!result.ok) {
      problem = failureText(result);
      return;
    }
    problem = null;
    invites = result.invites;
    toast(t("settings.invites.removed"));
  }
</script>

<p class="hint">{t("settings.invites.hint")}</p>
<form class="field" onsubmit={add} novalidate>
  <label class="label" for="invite-entries">{t("settings.invites.field")}</label>
  <textarea
    id="invite-entries"
    bind:value={typed}
    oninput={() => (problem = null)}
    rows="3"
    autocomplete="off"
    spellcheck="false"
    aria-invalid={problem !== null}
    aria-describedby="invite-hint"
  ></textarea>
  <p class="hint" class:problem={problem !== null} id="invite-hint" aria-live="polite">
    {#if problem}<Icon name="alert" size={14} />{problem}{:else}{t("settings.invites.fieldHint")}{/if}
  </p>
  <div class="actions">
    <Button variant="primary" type="submit" loading={adding} disabled={adding}>{t("settings.invites.add")}</Button>
  </div>
</form>
{#if invites.length === 0}
  <p class="none">{t("settings.invites.none")}</p>
{:else}
  <ul class="invites">
    {#each invites as invite (invite.id)}
      <li class="invite">
        <div class="about">
          <p class="entry">{invite.entry}</p>
          <p class="dates">
            <span
              >{invite.addedBy
                ? t("settings.invites.addedBy", { date: formatDate(lang, invite.addedAt), handle: invite.addedBy })
                : t("settings.invites.addedOn", { date: formatDate(lang, invite.addedAt) })}</span
            >
            {#if invite.claimedAt === null}
              <span>{t("settings.invites.waiting")}</span>
            {:else if invite.claimedBy}
              <span>{t("settings.invites.claimedBy", { date: formatDate(lang, invite.claimedAt), handle: invite.claimedBy })}</span>
            {:else}
              <span>{t("settings.invites.claimedOn", { date: formatDate(lang, invite.claimedAt) })}</span>
            {/if}
          </p>
        </div>
        {#if invite.claimedAt === null}
          <Button
            variant="danger-quiet"
            size="sm"
            loading={removing === invite.id}
            disabled={removing !== null}
            aria-label={t("settings.invites.removeOne", { entry: invite.entry })}
            onclick={() => remove(invite.id)}>{t("settings.invites.remove")}</Button
          >
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  textarea {
    padding: 8px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: var(--text-base);
    line-height: var(--leading-ui);
    resize: vertical;
  }
  textarea:hover {
    border-color: var(--text-faint);
  }
  textarea:focus-visible {
    border-color: var(--accent);
    outline: none;
  }
  textarea[aria-invalid="true"] {
    border-color: var(--danger);
  }
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
  .actions {
    display: flex;
    margin-top: var(--space-3);
  }
  .invites {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .invite {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--border);
  }
  .invite:last-child {
    border-bottom: 1px solid var(--border);
  }
  .about {
    min-width: 0;
  }
  .entry {
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
</style>
