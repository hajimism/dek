<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    trigger,
    children,
    align = "end",
    triggerClass = "",
  }: {
    label: string;
    trigger: Snippet;
    children: Snippet<[() => void]>;
    align?: "start" | "end";
    triggerClass?: string;
  } = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();
  let panel: HTMLDivElement | undefined = $state();

  function close(refocus = false) {
    open = false;
    if (refocus) {
      button?.focus();
    }
  }

  function items(): HTMLElement[] {
    return panel ? [...panel.querySelectorAll<HTMLElement>("[role^='menuitem']")] : [];
  }

  $effect(() => {
    if (!open) {
      return;
    }
    queueMicrotask(() => {
      const list = items();
      (list.find((item) => item.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
    });
    const onPointer = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = (at + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  }
</script>

<div class="menu" bind:this={root}>
  <button
    bind:this={button}
    type="button"
    class="trigger {triggerClass}"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    title={label}
    onclick={() => (open = !open)}
  >
    {@render trigger()}
  </button>
  {#if open}
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="panel {align}" role="menu" tabindex="-1" bind:this={panel} {onkeydown}>
      {@render children(() => close(true))}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 36px;
    height: 36px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background-color var(--dur-instant) var(--ease-out),
      color var(--dur-instant) var(--ease-out);
  }
  .trigger:hover,
  .trigger[aria-expanded="true"] {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .trigger.avatar-trigger {
    padding: 0 4px;
    border-radius: var(--radius-full);
  }
  .panel {
    position: absolute;
    z-index: var(--z-popover);
    top: calc(100% + 6px);
    min-width: 200px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-md);
    animation: pop var(--dur-base) var(--ease-out);
    transform-origin: top right;
  }
  .panel.end {
    right: 0;
  }
  .panel.start {
    left: 0;
    transform-origin: top left;
  }
  .panel :global([role^="menuitem"]) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font-size: var(--text-md);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .panel :global([role^="menuitem"]:hover),
  .panel :global([role^="menuitem"]:focus-visible) {
    background: var(--bg-subtle);
    outline: none;
  }
  .panel :global([role^="menuitem"] svg) {
    color: var(--text-faint);
  }
  .panel :global(.menu-check) {
    margin-left: auto;
    color: var(--accent) !important;
  }
  .panel :global(hr) {
    margin: 4px -4px;
    border: 0;
    border-top: 1px solid var(--border);
  }
  .panel :global(.menu-meta) {
    padding: 8px 10px 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }
</style>
