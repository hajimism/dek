<script lang="ts">
  // The theater with a plain stage and panel, as the talk page fills it.
  import Theater from "../../../src/model/deck/feature/talk/ui/theater.svelte";

  let { reviewCount = 2 }: { reviewCount?: number | null } = $props();
  let theater: Theater | undefined = $state();
  let immersive = $state(false);
  let reviewing = $state(false);
</script>

<button type="button" onclick={() => theater?.enter()}>Enter</button>
<Theater bind:this={theater} bind:immersive bind:reviewing title="Why dek" author="Hajime" position="3 / 18" {reviewCount}>
  {#snippet stage()}<div data-testid="stage">slide</div>{/snippet}
  {#snippet panel()}<div data-testid="panel">threads</div>{/snippet}
  <!-- Inside the frame, which covers the page: the deck's c reaches the theater as this does. -->
  {#snippet extra()}<button type="button" onclick={() => theater?.toggleReview()}>Key c from the deck</button>{/snippet}
</Theater>
