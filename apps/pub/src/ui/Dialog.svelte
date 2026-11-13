<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title,
    children,
    actions,
    onclose,
  }: {
    open?: boolean;
    title: string;
    children?: Snippet;
    actions?: Snippet;
    onclose?: () => void;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const uid = $props.id();
  const titleId = `dek-dialog-${uid}`;

  $effect(() => {
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  onclose={() => {
    open = false;
    onclose?.();
  }}
  onclick={(event) => {
    if (event.target === dialog) {
      open = false;
    }
  }}
>
  <div class="body">
    <h2 id={titleId}>{title}</h2>
    {#if children}<div class="content">{@render children()}</div>{/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100% - 32px));
    max-height: calc(100dvh - 32px);
    margin: auto;
    padding: 0;
    border: 1px solid var(--floating-border);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-lg);
  }
  dialog[open] {
    animation: enter var(--dur-slow) var(--ease-out);
  }
  dialog::backdrop {
    background: var(--overlay);
  }
  dialog[open]::backdrop {
    animation: fade var(--dur-slow) var(--ease-out);
  }
  .body {
    padding: var(--space-6);
  }
  h2 {
    font-size: var(--text-lg);
  }
  .content {
    margin-top: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-md);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-6);
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
