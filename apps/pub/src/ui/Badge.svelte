<script lang="ts">
  import type { Snippet } from "svelte";

  type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

  let { tone = "neutral", children }: { tone?: Tone; children: Snippet } = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-xs);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    line-height: 1;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .badge :global(svg) {
    width: 12px;
    height: 12px;
  }
  .neutral {
    background: var(--bg-active);
    color: var(--text-muted);
  }
  .accent {
    background: var(--accent-subtle);
    color: var(--accent);
  }
  .success {
    background: var(--success-subtle);
    color: var(--success);
  }
  .warning {
    background: var(--warning-subtle);
    color: var(--warning);
  }
  .danger {
    background: var(--danger-subtle);
    color: var(--danger);
  }
  .outline {
    background: transparent;
    color: var(--text-muted);
    box-shadow: inset 0 0 0 1px var(--border-strong);
  }
</style>
