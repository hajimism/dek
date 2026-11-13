<script lang="ts">
  import NotFound from "../../../src/shell/ui/not-found.svelte";
  import TalkPage from "../../../src/model/deck/feature/talk/ui/talk-page.svelte";
  import type { Props } from "./index.server";

  let { talk }: Props = $props();
</script>

{#if talk}
  {#key talk.id}
    <TalkPage {talk} />
  {/key}
{:else}
  <NotFound />
{/if}
