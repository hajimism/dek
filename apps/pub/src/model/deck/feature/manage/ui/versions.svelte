<script lang="ts">
  import type { DeckStatus, VersionSummary } from "../../../../../../../../src/pub/protocol.ts";
  import { absoluteTime, relativeTime } from "../../../../../common/i18n.ts";
  import { ApiFailure, api } from "../../../../../common/ui/api.ts";
  import Badge from "../../../../../common/ui/badge.svelte";
  import Button from "../../../../../common/ui/button.svelte";
  import { now } from "../../../../../common/ui/clock.svelte.ts";
  import Dialog from "../../../../../common/ui/dialog.svelte";
  import { toast } from "../../../../../common/ui/toast.svelte.ts";
  import { useApp } from "../../../../../shell/use-app.ts";

  let { status, onchange }: { status: DeckStatus; onchange: (next: DeckStatus) => void } = $props();
  const { shared, lang, t } = useApp();
  let target: VersionSummary | null = $state(null);
  let open = $state(false);
  let busy = $state(false);

  function ask(version: VersionSummary) {
    target = version;
    open = true;
  }

  async function promote() {
    if (!target) {
      return;
    }
    busy = true;
    const n = target.n;
    try {
      onchange(await api<DeckStatus>(`/api/decks/${status.id}/promote`, { method: "POST", body: { n } }));
      toast(t("rollback.done", { n }));
      open = false;
    } catch (error) {
      toast(
        error instanceof ApiFailure && error.code !== "offline"
          ? t("common.error", { message: error.message })
          : t("common.offline"),
        { tone: "error" },
      );
    } finally {
      busy = false;
    }
  }

  /** The talk page on this version: the team's side may open a draft there before it is current. */
  function viewHref(version: VersionSummary): string {
    const path = new URL(status.url).pathname;
    return version.n === status.current ? path : `${path}?v=${version.n}`;
  }

  function changedLine(version: VersionSummary): string {
    const n = version.changed?.length ?? 0;
    return n === 1 ? t("manage.versions.changedOne") : t("manage.versions.changed", { n });
  }
</script>

<ol class="list">
  {#each status.versions as version (version.n)}
    {@const current = version.n === status.current}
    <li class="row" class:current>
      <span class="n num">v{version.n}</span>
      <div class="middle">
        <p class="message">
          {#if version.message}{version.message}{:else}<span class="none">{t("manage.versions.noMessage")}</span>{/if}
          {#if current}<Badge tone="accent">{t("manage.versions.current")}</Badge>{/if}
        </p>
        <p class="meta">
          <time datetime={version.createdAt} title={absoluteTime(lang, version.createdAt)}>{relativeTime(lang, version.createdAt, now(shared.now))}</time>
          <span aria-hidden="true">·</span>
          <span>{t("manage.versions.dek", { version: version.dekVersion })}</span>
          {#if version.changed && version.changed.length > 0}
            <span aria-hidden="true">·</span>
            <span title={version.changed.join(", ")}>{changedLine(version)}</span>
          {/if}
          <span aria-hidden="true">·</span>
          <span class:warn={version.lint.errors > 0}>{t("manage.versions.lint", { errors: version.lint.errors, warnings: version.lint.warnings })}</span>
        </p>
        {#if version.changed && version.changed.length > 0}
          <p class="slugs">
            {#each version.changed.slice(0, 6) as slug (slug)}<code>{slug}</code>{/each}
            {#if version.changed.length > 6}<span class="more">+{version.changed.length - 6}</span>{/if}
          </p>
        {/if}
      </div>
      <div class="buttons">
        <Button variant="ghost" size="sm" href={viewHref(version)}>{t("manage.versions.view")}</Button>
        {#if !current}
          <Button variant="secondary" size="sm" onclick={() => ask(version)}>{t("manage.versions.makeCurrent")}</Button>
        {/if}
      </div>
    </li>
  {/each}
</ol>

<Dialog bind:open title={target ? t("rollback.title", { n: target.n }) : ""}>
  {#if target}
    <p>{t("rollback.body", { n: target.n, current: status.current ?? "" })}</p>
  {/if}
  {#snippet actions()}
    <Button variant="secondary" autofocus onclick={() => (open = false)}>{t("common.cancel")}</Button>
    <Button variant="primary" loading={busy} onclick={promote}>{target ? t("rollback.confirm", { n: target.n }) : ""}</Button>
  {/snippet}
</Dialog>

<style>
  .buttons {
    display: flex;
    flex: none;
    gap: var(--space-1);
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
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
    min-height: 56px;
    padding: var(--space-3) var(--space-4);
  }
  .row + .row {
    border-top: 1px solid var(--border);
  }
  .n {
    min-width: 3ch;
    align-self: start;
    padding-top: 1px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
  .current .n {
    color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .message {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-weight: var(--weight-medium);
  }
  .none {
    color: var(--text-faint);
    font-weight: var(--weight-regular);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .warn {
    color: var(--danger);
  }
  .slugs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  code {
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    background: var(--bg-subtle);
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .more {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
  @media (max-width: 639px) {
    .row {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .row > :global(.btn) {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
