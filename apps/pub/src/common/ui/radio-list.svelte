<script lang="ts" generics="V extends string">
  // A choice of one among a few, one row each with its label and a line under it saying what it
  // means: rows on the section's own edge, no box around each, the choice shown by its radio.
  import Icon, { type IconName } from "./icon.svelte";
  import { RadioFocus } from "./radio-focus.svelte.ts";

  type Option = { value: V; label: string; hint: string; icon?: IconName };

  let {
    options,
    value,
    label,
    onselect,
    disabled = false,
  }: {
    options: readonly Option[];
    value: V;
    /** The group's accessible name. */
    label: string;
    /** Asked to move to `next`; the owner of `value` decides whether it does. */
    onselect: (next: V) => void;
    disabled?: boolean;
  } = $props();

  const uid = $props.id();
  const index = $derived(Math.max(0, options.findIndex((option) => option.value === value)));
  const radios = new RadioFocus(
    () => options.length,
    () => index,
  );

  /** Put focus back on the chosen option, as after a choice was asked about and declined. */
  export function focusChosen() {
    radios.focusChosen();
  }
</script>

<div
  class="list"
  role="radiogroup"
  aria-label={label}
  aria-disabled={disabled ? "true" : undefined}
  onfocusout={(event) => radios.leave(event)}
>
  {#each options as option, i (option.value)}
    <button
      bind:this={radios.radios[i]}
      type="button"
      role="radio"
      class="row"
      aria-checked={option.value === value}
      aria-labelledby="{uid}-{i}-label"
      aria-describedby="{uid}-{i}-hint"
      tabindex={i === radios.tabStop ? 0 : -1}
      {disabled}
      onclick={() => option.value !== value && onselect(option.value)}
      onkeydown={(event) => radios.move(event, i)}
      onfocus={() => radios.focus(i)}
    >
      <span class="radio" aria-hidden="true"></span>
      <span class="text">
        <span class="label" id="{uid}-{i}-label" data-label>
          {#if option.icon}<Icon name={option.icon} size={14} />{/if}{option.label}
        </span>
        <span class="hint" id="{uid}-{i}-hint" data-hint>{option.hint}</span>
      </span>
    </button>
  {/each}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) 0;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .radio {
    position: relative;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-top: 3px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-full);
    background: var(--surface);
    transition: border-color var(--dur-fast) var(--ease-out);
  }
  .radio::after {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: var(--radius-full);
    background: var(--accent);
    transform: scale(0);
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .row[aria-checked="true"] .radio {
    border-color: var(--accent);
  }
  .row[aria-checked="true"] .radio::after {
    transform: scale(1);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: var(--weight-medium);
    overflow-wrap: anywhere;
  }
  .row[aria-checked="true"] .label,
  .row:hover:not(:disabled) .label {
    color: var(--text);
  }
  .hint {
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }
  .hint:lang(ja) {
    word-break: auto-phrase;
  }
  .row:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
