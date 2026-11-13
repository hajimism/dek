<script lang="ts">
  let {
    checked,
    label,
    hint,
    onchange,
    disabled = false,
    id,
  }: {
    checked: boolean;
    label: string;
    hint?: string;
    onchange: (next: boolean) => void;
    disabled?: boolean;
    id: string;
  } = $props();
</script>

<div class="row">
  <div class="text">
    <label class="label" for={id} id="{id}-label">{label}</label>
    {#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
  </div>
  <button
    {id}
    type="button"
    role="switch"
    class="switch"
    aria-checked={checked}
    aria-labelledby="{id}-label"
    aria-describedby={hint ? `${id}-hint` : undefined}
    {disabled}
    onclick={() => onchange(!checked)}
  >
    <span class="knob" aria-hidden="true"></span>
  </button>
</div>

<style>
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-6);
  }
  .label {
    display: block;
    font-weight: var(--weight-medium);
    color: var(--text);
    cursor: pointer;
  }
  .hint {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .switch {
    position: relative;
    flex-shrink: 0;
    width: 36px;
    height: 22px;
    margin-top: 1px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-full);
    background: var(--bg-active);
    cursor: pointer;
    transition:
      background-color var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }
  .switch::before {
    content: "";
    position: absolute;
    inset: -11px -4px;
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-full);
    background: var(--surface);
    box-shadow: var(--shadow-sm), 0 0 0 1px var(--border-strong);
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .switch[aria-checked="true"] {
    background: var(--accent);
    border-color: var(--accent);
  }
  .switch[aria-checked="true"] .knob {
    transform: translateX(14px);
    box-shadow: var(--shadow-sm);
  }
  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
