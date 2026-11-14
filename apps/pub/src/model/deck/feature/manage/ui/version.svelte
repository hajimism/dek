<script lang="ts">
  // The version readers see: its number, when it was published, its message and what it changed.
  import { absoluteTime, relativeTime } from "../../../../../common/i18n.ts";
  import { now } from "../../../../../common/ui/clock.svelte.ts";
  import { useApp } from "../../../../../shell/use-app.ts";
  import type { CurrentVersion } from "../type.ts";

  let { version }: { version: CurrentVersion | null } = $props();
  const { shared, lang, t } = useApp();

  const changedLine = $derived(
    version?.changed.length === 1
      ? t("manage.version.changedOne")
      : t("manage.version.changed", { n: version?.changed.length ?? 0 }),
  );
</script>

{#if version}
  <div class="row">
    <span class="n num">v{version.n}</span>
    <div class="middle">
      <p class="message">
        {#if version.message}{version.message}{:else}<span class="none">{t("manage.version.noMessage")}</span>{/if}
      </p>
      <p class="meta">
        <time datetime={version.createdAt} title={absoluteTime(lang, version.createdAt)}>{relativeTime(lang, version.createdAt, now(shared.now))}</time>
        {#if version.changed.length > 0}
          <span aria-hidden="true">·</span>
          <span title={version.changed.join(", ")}>{changedLine}</span>
        {/if}
      </p>
      {#if version.changed.length > 0}
        <p class="slugs">
          {#each version.changed.slice(0, 6) as slug (slug)}<code>{slug}</code>{/each}
          {#if version.changed.length > 6}<span class="more">+{version.changed.length - 6}</span>{/if}
        </p>
      {/if}
    </div>
  </div>
{:else}
  <p class="row none">{t("manage.version.none")}</p>
{/if}

<style>
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-4);
    min-height: 56px;
    margin: var(--space-2) 0 0;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .n {
    min-width: 3ch;
    align-self: start;
    padding-top: 1px;
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }
  .message {
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
</style>
