<script lang="ts">
  
  import TalkPage from "../../../src/model/deck/feature/talk/ui/talk-page.svelte";
import NotFound from "../../../src/shell/ui/not-found.svelte";
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
