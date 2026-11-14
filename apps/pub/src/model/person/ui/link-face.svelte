<script lang="ts">
  // A link as a profile names it: an icon, the service's name or the site's host, and the account.
  import Icon from "../../../common/ui/icon.svelte";
  import { linkFace } from "../link.ts";

  let { url }: { url: string } = $props();
  const face = $derived(linkFace(url));
  const icon = $derived(face.service === "github" ? "github" : face.service === "website" ? "globe" : "link");
</script>

<Icon name={icon} size={14} /><span>{face.name}</span>{#if face.account}<span class="account">{face.account}</span>{/if}

<style>
  .account {
    color: var(--text-faint);
    font-weight: var(--weight-regular);
  }
</style>
