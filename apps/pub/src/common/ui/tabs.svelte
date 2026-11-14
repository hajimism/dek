<script lang="ts" generics="V extends string">
  // Tabs over one panel at a time. The arrow keys, Home and End move to a tab and show it at
  // once, since a tab here only changes how the same things are shown. The panel is the caller's:
  // it takes the id `{id}-{value}` and is labelled by `{id}-{value}-tab`.
  import Icon, { type IconName } from "./icon.svelte";

  let {
    id,
    options,
    value,
    label,
    onselect,
  }: {
    id: string;
    options: ReadonlyArray<{ value: V; label: string; icon?: IconName }>;
    value: V;
    label: string;
    onselect: (next: V) => void;
  } = $props();

  const tabs: HTMLButtonElement[] = $state([]);

  function onkeydown(event: KeyboardEvent, from: number) {
    const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    let to: number | null = null;
    if (event.key in keys) {
      to = (from + (keys[event.key] ?? 0) + options.length) % options.length;
    } else if (event.key === "Home") {
      to = 0;
    } else if (event.key === "End") {
      to = options.length - 1;
    }
    const next = to === null ? undefined : options[to];
    if (to === null || !next) {
      return;
    }
    event.preventDefault();
    tabs[to]?.focus();
    onselect(next.value);
  }
</script>

<div class="tabs" role="tablist" aria-label={label}>
  {#each options as option, i (option.value)}
    <button
      bind:this={tabs[i]}
      type="button"
      role="tab"
      id="{id}-{option.value}-tab"
      aria-controls="{id}-{option.value}"
      aria-selected={option.value === value}
      tabindex={option.value === value ? 0 : -1}
      onclick={() => onselect(option.value)}
      onkeydown={(event) => onkeydown(event, i)}
    >
      {#if option.icon}<Icon name={option.icon} size={14} />{/if}
      {option.label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: var(--space-5);
    border-bottom: 1px solid var(--border);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: -1px;
    padding: var(--space-2) 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition:
      color var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }
  button:hover {
    color: var(--text);
  }
  button[aria-selected="true"] {
    border-bottom-color: var(--text);
    color: var(--text);
  }
</style>
