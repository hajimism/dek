<script lang="ts">
  // "Show more" below a profile's talks. It is a link to the next page, which a crawler, or a
  // browser without scripts, follows; the page loads the talks in place instead.
  import Button from "../../../../../common/ui/button.svelte";
  import { useApp } from "../../../../../shell/use-app.ts";

  let {
    href,
    remaining,
    loading,
    onmore,
  }: { href: string; remaining: number; loading: boolean; onmore: () => void } = $props();

  const { t } = useApp();

  function more(event: MouseEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (!loading) {
      onmore();
    }
  }
</script>

{#if remaining > 0}
  <p class="more">
    <Button {href} rel="next" {loading} aria-busy={loading} iconAfter={loading ? undefined : "chevron-down"} onclick={more}>{t("profile.more", { n: remaining })}</Button>
  </p>
{/if}

<style>
  .more {
    display: flex;
    justify-content: center;
    margin-top: var(--space-12);
  }
</style>
