<script lang="ts">
  import SettingsPage from "../src/model/person/feature/settings/ui/settings-page.svelte";
  import type { Props } from "./settings.server";

  let { handle, name, links, keys, invites }: Props = $props();
</script>

<SettingsPage {handle} {name} {links} {keys} {invites} />
