<script lang="ts">
  import NotFound from "../../../src/ui/NotFound.svelte";
  import TalkPage from "../../../src/ui/talk/TalkPage.svelte";
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
