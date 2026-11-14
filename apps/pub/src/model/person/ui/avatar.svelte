<script lang="ts">
  let {
    name,
    image = null,
    size = 28,
    pending = false,
  }: {
    name: string;
    image?: string | null;
    size?: 20 | 28 | 32 | 72;
    /** Someone invited by email who has no account yet: drawn as an outline. */
    pending?: boolean;
  } = $props();

  const initials = $derived(
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? "")
      .join("")
      .toUpperCase() || "?",
  );
  let failed = $state(false);
</script>

<span
  class="avatar"
  class:pending
  style:--size="{size}px"
  style:--font="{Math.round(size * 0.4)}px"
  aria-hidden="true"
>
  {#if image && !failed}
    <img src={image} alt="" width={size} height={size} loading="lazy" onerror={() => (failed = true)} />
  {:else}
    {size <= 20 ? Array.from(initials)[0] : initials}
  {/if}
</span>

<style>
  .avatar {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    width: var(--size);
    height: var(--size);
    border-radius: var(--radius-full);
    background: var(--bg-active);
    color: var(--text-muted);
    font-size: var(--font);
    font-weight: var(--weight-semibold);
    line-height: 1;
    letter-spacing: 0;
    overflow: hidden;
    user-select: none;
  }
  .avatar::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
  }
  .pending {
    background: transparent;
  }
  .pending::after {
    box-shadow: none;
    border: 1px dashed var(--border-strong);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
