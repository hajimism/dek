<script lang="ts">
  import NotFound from "../../../src/ui/NotFound.svelte";
  import ManagePage from "../../../src/ui/manage/ManagePage.svelte";
  import type { Props } from "./manage.server";

  let { manage }: Props = $props();
</script>

{#if manage}
  {#key manage.status.id}
    <ManagePage status={manage.status} grants={manage.grants} />
  {/key}
{:else}
  <NotFound />
{/if}
