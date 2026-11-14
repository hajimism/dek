<script lang="ts" generics="V extends string">
  import Icon, { type IconName } from "./icon.svelte";
  import { RadioFocus } from "./radio-focus.svelte.ts";

  type Option = { value: V; label: string; icon?: IconName };

  let {
    options,
    value,
    label,
    onselect,
    disabled = false,
    stretch = false,
    describedby,
  }: {
    options: readonly Option[];
    value: V;
    /** The group's accessible name. */
    label: string;
    /** Asked to move to `next`; the owner of `value` decides whether it does. */
    onselect: (next: V) => void;
    disabled?: boolean;
    stretch?: boolean;
    describedby?: string;
  } = $props();

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
  class="track"
  class:stretch
  role="radiogroup"
  aria-label={label}
  aria-describedby={describedby}
  aria-disabled={disabled ? "true" : undefined}
  style:--count={options.length}
  style:--index={index}
  onfocusout={(event) => radios.leave(event)}
>
  <span class="thumb" aria-hidden="true"></span>
  {#each options as option, i (option.value)}
    <button
      bind:this={radios.radios[i]}
      type="button"
      role="radio"
      class="segment"
      aria-checked={option.value === value}
      tabindex={i === radios.tabStop ? 0 : -1}
      {disabled}
      onclick={() => option.value !== value && onselect(option.value)}
      onkeydown={(event) => radios.move(event, i)}
      onfocus={() => radios.focus(i)}
    >
      {#if option.icon}<Icon name={option.icon} size={14} />{/if}
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .track {
    position: relative;
    display: inline-grid;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    height: 36px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
    isolation: isolate;
    max-width: 100%;
  }
  .stretch {
    display: grid;
    width: 100%;
  }
  .thumb {
    position: absolute;
    z-index: -1;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 4px) / var(--count));
    border-radius: 4px;
    background: var(--surface);
    box-shadow:
      var(--shadow-sm),
      0 0 0 1px var(--border);
    transform: translateX(calc(100% * var(--index)));
    transition: transform var(--dur-base) var(--ease-out);
  }
  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    padding: 0 12px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    cursor: pointer;
    transition: color var(--dur-instant) var(--ease-out);
  }
  .segment span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .segment:hover:not(:disabled) {
    color: var(--text);
  }
  .segment[aria-checked="true"] {
    color: var(--text);
  }
  .segment:focus-visible {
    outline-offset: 0;
  }
  .segment:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  @media (max-width: 639px) {
    .track {
      display: grid;
      width: 100%;
    }
    .segment {
      padding: 0 6px;
      font-size: var(--text-sm);
    }
  }
</style>
