<script lang="ts">
  import NotFound from "../../../src/shell/ui/not-found.svelte";
  import ManagePage from "../../../src/model/deck/feature/manage/ui/manage-page.svelte";
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
