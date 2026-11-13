<script lang="ts">
  import { useApp } from "../../shell/use-app.ts";
  import Icon from "./icon.svelte";
  import { dismiss, pause, resume, toasts } from "./toast.svelte.ts";

  const { t } = useApp();
</script>

<div class="region" aria-live="polite">
  {#each toasts as entry (entry.id)}
    <div
      class="toast"
      class:error={entry.tone === "error"}
      role={entry.tone === "error" ? "alert" : "status"}
      onmouseenter={() => pause(entry.id)}
      onmouseleave={() => resume(entry.id)}
      onfocusin={() => pause(entry.id)}
      onfocusout={() => resume(entry.id)}
    >
      {#if entry.tone === "error"}
        <Icon name="alert" />
      {:else}
        <Icon name="check" />
      {/if}
      <p>{entry.message}</p>
      {#if entry.action}
        {@const action = entry.action}
        <button
          type="button"
          class="action"
          onclick={() => {
            action.run();
            dismiss(entry.id);
          }}>{action.label}</button
        >
      {/if}
      <button type="button" class="close" aria-label={t("common.close")} onclick={() => dismiss(entry.id)}>
        <Icon name="x" size={14} />
      </button>
    </div>
  {/each}
</div>

<style>
  .region {
    position: fixed;
    z-index: var(--z-toast);
    right: var(--space-4);
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: min(400px, calc(100vw - 32px));
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-lg);
    font-size: var(--text-md);
    pointer-events: auto;
    animation: enter var(--dur-base) var(--ease-out);
  }
  .toast > :global(svg) {
    color: var(--success);
  }
  .toast.error > :global(svg) {
    color: var(--danger);
  }
  p {
    flex: 1;
    min-width: 0;
  }
  .action {
    padding: 4px 8px;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--accent);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }
  .action:hover {
    background: var(--accent-subtle);
  }
  .close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }
  .close:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }
  @media (max-width: 639px) {
    .region {
      left: var(--space-4);
      align-items: stretch;
    }
    .toast {
      max-width: none;
    }
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
