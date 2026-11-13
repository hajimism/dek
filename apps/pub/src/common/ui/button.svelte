<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
  import Icon, { type IconName } from "./icon.svelte";

  type Variant = "primary" | "secondary" | "ghost" | "danger" | "neutral" | "danger-quiet";
  type Size = "sm" | "md" | "lg";

  type Props = {
    variant?: Variant;
    size?: Size;
    icon?: IconName;
    iconAfter?: IconName;
    loading?: boolean;
    /** Only an icon shows; the label is for screen readers and the tooltip. */
    iconOnly?: boolean;
    full?: boolean;
    href?: string;
    label?: string;
    children?: Snippet;
  } & Omit<HTMLButtonAttributes, "children"> &
    Omit<HTMLAnchorAttributes, "children">;

  let {
    variant = "secondary",
    size = "md",
    icon,
    iconAfter,
    loading = false,
    iconOnly = false,
    full = false,
    href,
    label,
    children,
    type = "button",
    class: className = "",
    ...rest
  }: Props = $props();

  const classes = $derived(
    ["btn", variant, size, iconOnly ? "icon-only" : "", full ? "full" : "", className].join(" "),
  );
</script>

{#snippet content()}
  {#if loading}
    <Icon name="spinner" size={size === "sm" ? 14 : 16} />
  {:else if icon}
    <Icon name={icon} size={size === "sm" ? 14 : 16} />
  {/if}
  {#if iconOnly}
    <span class="visually-hidden">{label}</span>
  {:else if children}
    <span class="label">{@render children()}</span>
  {:else if label}
    <span class="label">{label}</span>
  {/if}
  {#if iconAfter && !iconOnly}
    <Icon name={iconAfter} size={size === "sm" ? 14 : 16} />
  {/if}
{/snippet}

{#if href}
  <a {href} class={classes} title={iconOnly ? label : undefined} {...rest as HTMLAnchorAttributes}>
    {@render content()}
  </a>
{:else}
  <button
    {type}
    class={classes}
    aria-busy={loading ? "true" : undefined}
    title={iconOnly ? label : undefined}
    {...rest as HTMLButtonAttributes}
  >
    {@render content()}
  </button>
{/if}

<style>
  .btn {
    --btn-h: 36px;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: var(--btn-h);
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    line-height: 1;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    user-select: none;
    transition:
      background-color var(--dur-instant) var(--ease-out),
      border-color var(--dur-instant) var(--ease-out),
      color var(--dur-instant) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
    -webkit-tap-highlight-color: transparent;
  }
  .btn:active:not(:disabled) {
    transform: scale(0.98);
  }
  .btn:disabled,
  .btn[aria-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn[aria-busy="true"] {
    cursor: progress;
  }
  .sm {
    --btn-h: 28px;
    padding: 0 10px;
    font-size: var(--text-sm);
    gap: 6px;
  }
  .lg {
    --btn-h: 44px;
    padding: 0 18px;
    font-size: var(--text-md);
  }
  .full {
    width: 100%;
  }
  .icon-only {
    width: var(--btn-h);
    padding: 0;
  }
  /* A touch target of 44px around the small buttons, without changing how they look. */
  @media (pointer: coarse) {
    .sm::after,
    .md.icon-only::after {
      content: "";
      position: absolute;
      inset: -8px;
    }
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
    color: var(--on-accent);
  }
  .secondary {
    background: var(--surface);
    border-color: var(--border-strong);
    color: var(--text);
  }
  .secondary:hover:not(:disabled) {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .ghost {
    background: transparent;
    color: var(--text-muted);
  }
  .ghost:hover:not(:disabled) {
    background: var(--bg-subtle);
    color: var(--text);
  }
  .ghost[aria-pressed="true"],
  .ghost[aria-expanded="true"] {
    background: var(--bg-active);
    color: var(--text);
  }
  .neutral {
    background: var(--gray-1000);
    color: var(--bg);
  }
  .neutral:hover:not(:disabled) {
    background: var(--gray-900);
    color: var(--bg);
  }
  .danger {
    background: var(--danger);
    color: var(--on-danger);
  }
  .danger:hover:not(:disabled) {
    background: var(--danger-hover);
    color: var(--on-danger);
  }
  .danger-quiet {
    background: var(--surface);
    border-color: var(--border-strong);
    color: var(--danger);
  }
  .danger-quiet:hover:not(:disabled) {
    background: var(--danger-subtle);
    color: var(--danger);
  }
</style>
