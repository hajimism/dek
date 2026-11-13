<script lang="ts">
  import type { Visibility } from "../../../../../../src/pub/protocol.ts";
  import Badge from "../../../common/ui/badge.svelte";
  import Icon from "../../../common/ui/icon.svelte";
  import { useApp } from "../../../shell/use-app.ts";

  let { visibility }: { visibility: Visibility } = $props();
  const { t } = useApp();
  const look = {
    private: { tone: "neutral", icon: "lock" },
    link: { tone: "accent", icon: "link" },
    public: { tone: "success", icon: "globe" },
  } as const;
</script>

<Badge tone={look[visibility].tone}>
  <Icon name={look[visibility].icon} size={12} />
  {t(`visibility.${visibility}`)}
</Badge>
