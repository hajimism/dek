<script lang="ts">
  import About from "../src/shell/ui/about.svelte";
  import type { Props } from "./about.server";

  let { sample }: Props = $props();
</script>

<About {sample} />
