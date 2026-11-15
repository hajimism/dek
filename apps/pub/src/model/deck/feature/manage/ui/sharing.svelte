<script lang="ts">
  import { untrack } from "svelte";
  import { paths } from "../../../../../../../../src/pub/paths.ts";
  import type { Grant, GrantRole, GrantSide } from "../../../../../../../../src/pub/protocol.ts";
  import { ApiFailure, api } from "../../../../../common/ui/api.ts";
  import Button from "../../../../../common/ui/button.svelte";
  import { type Shown, showFirst } from "../../../../../common/ui/call.ts";
  import { failureText } from "../../../../../common/ui/failure.ts";
  import Icon from "../../../../../common/ui/icon.svelte";
  import { toast } from "../../../../../common/ui/toast.svelte.ts";
  import { useApp } from "../../../../../shell/use-app.ts";
  import Avatar from "../../../../person/ui/avatar.svelte";

  let { deckId, initial }: { deckId: string; initial: Grant[] } = $props();
  const { t } = useApp();
  let grants: Grant[] = $state(untrack(() => initial));
  let who = $state("");
  let role: GrantRole = $state("view");
  let side: GrantSide = $state("guest");
  let adding = $state(false);
  let error = $state("");
  let errorHint = $state("");

  function failure(err: unknown): string {
    if (err instanceof ApiFailure) {
      return err.code === "offline" ? t("common.offline") : err.message;
    }
    return "";
  }

  async function reload() {
    grants = (await api<{ grants: Grant[] }>(paths.grants(deckId))).grants;
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    error = "";
    errorHint = "";
    const name = who.trim();
    if (!name) {
      document.getElementById("grant-who")?.focus();
      return;
    }
    adding = true;
    try {
      await api(paths.grants(deckId), { method: "POST", body: { who: name, role, side } });
      await reload();
      toast(t("manage.sharing.added", { who: name }));
      who = "";
    } catch (err) {
      error = failure(err);
      errorHint = err instanceof ApiFailure ? err.hint : "";
    } finally {
      adding = false;
    }
  }

  async function change(grant: Grant, next: Pick<Grant, "role" | "side">) {
    try {
      await api(paths.grants(deckId), { method: "POST", body: { who: grant.who, ...next } });
      await reload();
      toast(t("saved"));
    } catch (err) {
      toast(failureText(t, err), { tone: "error" });
    }
  }

  const shownGrants: Shown<Grant[]> = { get: () => grants, set: (next) => (grants = next) };

  async function remove(grant: Grant) {
    const rest = grants.filter((entry) => entry.id !== grant.id);
    const removed = await showFirst(
      shownGrants,
      rest,
      async () => {
        await api(paths.grant(deckId, grant.id), { method: "DELETE" });
        return rest;
      },
      (err) => toast(failureText(t, err), { tone: "error" }),
    );
    if (removed) {
      toast(t("manage.sharing.removed", { who: label(grant) }), {
        action: { label: t("undo"), run: () => change(grant, { role: grant.role, side: grant.side }) },
      });
    }
  }

  function isEmail(value: string): boolean {
    return value.includes("@") && !value.startsWith("@");
  }

  function label(grant: Grant): string {
    return isEmail(grant.who) ? grant.who : `@${grant.who}`;
  }
</script>

<form class="add" onsubmit={add} novalidate>
  <div class="field who">
    <label for="grant-who">{t("manage.sharing.who")}</label>
    <input
      id="grant-who"
      bind:value={who}
      placeholder={t("manage.sharing.placeholder")}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? "grant-error" : undefined}
    />
  </div>
  <div class="field">
    <label for="grant-role">{t("role.label")}</label>
    <select id="grant-role" bind:value={role}>
      <option value="view">{t("role.view")}</option>
      <option value="comment">{t("role.comment")}</option>
    </select>
  </div>
  <div class="field">
    <label for="grant-side">{t("side.label")}</label>
    <select id="grant-side" bind:value={side} aria-describedby="grant-side-hint">
      <option value="guest">{t("side.guest")}</option>
      <option value="team">{t("side.team")}</option>
    </select>
  </div>
  <Button variant="primary" type="submit" icon="plus" loading={adding}>{t("manage.sharing.add")}</Button>
</form>
{#if error}
  <div class="error" id="grant-error" role="alert">
    <Icon name="alert" size={14} />
    <div>
      <p>{error}</p>
      {#if errorHint}<p class="error-hint">{errorHint}</p>{/if}
    </div>
  </div>
{/if}
<p class="side-hint" id="grant-side-hint">{t("manage.sharing.sideHint")}</p>

{#if grants.length === 0}
  <p class="empty">{t("manage.sharing.empty")}</p>
{:else}
  <ul class="list">
    {#each grants as grant (grant.id)}
      <li class="row">
        <Avatar name={grant.who.replace(/@.*/, "") || grant.who} size={28} pending={isEmail(grant.who)} />
        <span class="name">
          <span class="who-text">{label(grant)}</span>
          {#if isEmail(grant.who)}<span class="pending">{t("manage.sharing.pending")}</span>{/if}
        </span>
        <label class="visually-hidden" for="role-{grant.id}">{t("role.label")}: {label(grant)}</label>
        <select
          id="role-{grant.id}"
          class="compact"
          value={grant.role}
          onchange={(event) => change(grant, { role: event.currentTarget.value as GrantRole, side: grant.side })}
        >
          <option value="view">{t("role.view")}</option>
          <option value="comment">{t("role.comment")}</option>
        </select>
        <label class="visually-hidden" for="side-{grant.id}">{t("side.label")}: {label(grant)}</label>
        <select
          id="side-{grant.id}"
          class="compact"
          value={grant.side}
          onchange={(event) => change(grant, { role: grant.role, side: event.currentTarget.value as GrantSide })}
        >
          <option value="guest">{t("side.guest")}</option>
          <option value="team">{t("side.team")}</option>
        </select>
        <button type="button" class="remove" aria-label={t("manage.sharing.remove", { who: label(grant) })} title={t("manage.sharing.remove", { who: label(grant) })} onclick={() => remove(grant)}>
          <Icon name="x" size={14} />
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .add {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field.who {
    flex: 1;
    min-width: 0;
  }
  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  input,
  select {
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-base);
  }
  select {
    padding-right: 28px;
  }
  @media (min-width: 768px) {
    input,
    select {
      font-size: var(--text-md);
    }
  }
  input:hover,
  select:hover {
    border-color: var(--text-faint);
  }
  input:focus-visible,
  select:focus-visible {
    border-color: var(--accent);
    outline-offset: 0;
  }
  input[aria-invalid="true"] {
    border-color: var(--danger);
  }
  .add :global(.btn) {
    height: 40px;
  }
  @media (max-width: 639px) {
    .add {
      flex-wrap: wrap;
    }
    .field.who {
      flex-basis: 100%;
    }
    .field:not(.who) {
      flex: 1;
    }
  }
  .error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--danger);
    font-size: var(--text-sm);
  }
  .error :global(svg) {
    flex: none;
    margin-top: 0.15em;
  }
  .error p {
    margin: 0;
  }
  .error-hint {
    color: var(--text-muted);
  }
  .side-hint {
    margin-top: var(--space-2);
    color: var(--text-faint);
    font-size: var(--text-sm);
  }
  .empty {
    padding: var(--space-4) 0;
    color: var(--text-faint);
    font-size: var(--text-sm);
  }
  .list {
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 56px;
    padding: var(--space-2) var(--space-3);
  }
  .row + .row {
    border-top: 1px solid var(--border);
  }
  .name {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .who-text {
    font-weight: var(--weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pending {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
  select.compact {
    height: 32px;
    font-size: var(--text-sm);
  }
  @media (max-width: 639px) {
    /* The name keeps the first line; the role, the side and remove go under it. */
    .row {
      flex-wrap: wrap;
      row-gap: var(--space-2);
    }
    .name {
      flex-basis: calc(100% - 28px - var(--space-3));
    }
    .row select.compact {
      flex: 1 1 auto;
      min-width: 0;
    }
  }
  .remove {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }
  .remove:hover {
    background: var(--danger-subtle);
    color: var(--danger);
  }
</style>
