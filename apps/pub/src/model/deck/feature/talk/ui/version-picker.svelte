<script lang="ts">
  // For the team's side: which version the page shows, and whether it is the one the guests'
  // side reads. Choosing another reloads the page on it.
  import Icon from "../../../../../common/ui/icon.svelte";
  import { useApp } from "../../../../../shell/use-app.ts";
  import type { TalkVersion } from "../type.ts";

  let {
    versions,
    version,
    current,
    onpick,
  }: {
    versions: TalkVersion[];
    version: number;
    current: number | null;
    onpick: (n: number) => void;
  } = $props();

  const { t } = useApp();

  function label(each: TalkVersion): string {
    const n = each.n;
    const kind =
      n === current
        ? t("talk.versionCurrent", { n })
        : current === null || n > current
          ? t("talk.versionDraft", { n })
          : t("talk.versionOlder", { n });
    return each.message ? `${kind} — ${each.message}` : kind;
  }

  const note = $derived(
    version === current
      ? ""
      : current === null
        ? t("talk.draftNone", { n: version })
        : version > current
          ? t("talk.draft", { n: version, current })
          : t("talk.older", { n: version, current }),
  );
</script>

<div class="versions" class:off={note !== ""}>
  {#if note}
    <p class="note" role="status"><Icon name="alert" size={14} />{note}</p>
  {/if}
  <label class="pick">
    <span>{t("talk.versionPick")}</span>
    <select value={String(version)} onchange={(event) => onpick(Number(event.currentTarget.value))}>
      {#each versions as each (each.n)}
        <option value={String(each.n)}>{label(each)}</option>
      {/each}
    </select>
  </label>
</div>

<style>
  .versions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    margin: 0 auto var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    font-size: var(--text-sm);
  }
  .versions.off {
    border-color: var(--warning);
    background: var(--warning-subtle);
  }
  .note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    color: var(--warning);
    line-height: var(--leading-ui);
  }
  .note :global(svg) {
    flex: none;
    margin-top: 3px;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
    color: var(--text-muted);
  }
  select {
    max-width: 260px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-sm);
  }
</style>
