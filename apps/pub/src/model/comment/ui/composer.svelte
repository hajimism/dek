<script lang="ts">
  import type { ThreadScope } from "../../../../../../src/pub/protocol.ts";
  import Composer from "../../../common/ui/composer.svelte";
  import { useApp } from "../../../shell/use-app.ts";
  import type { ReplyInput } from "../type.ts";

  let {
    scopes = false,
    placeholder,
    submitLabel,
    compact = false,
    autofocus = false,
    draftKey,
    oncancel,
    onsubmit,
  }: {
    /** Offer to share the thread with the guests; each one is kept to the team unless checked. */
    scopes?: boolean;
    placeholder?: string;
    submitLabel?: string;
    compact?: boolean;
    autofocus?: boolean;
    /** Where the unsent text is kept across a reload; with none, it is not kept. */
    draftKey?: string;
    oncancel?: () => void;
    onsubmit: (input: ReplyInput) => Promise<boolean>;
  } = $props();

  const { t } = useApp();
  let shared = $state(false);
  const scope: ThreadScope = $derived(shared ? "shared" : "team");
  let composer: Composer | undefined = $state();

  export function focus() {
    composer?.focus();
  }

  async function submit(text: string): Promise<boolean> {
    const ok = await onsubmit({ text, ...(scopes ? { scope } : {}) });
    if (ok) {
      shared = false;
    }
    return ok;
  }
</script>

<Composer
  bind:this={composer}
  placeholder={placeholder ?? t("comment.placeholder")}
  submitLabel={submitLabel ?? t("comment.post")}
  {compact}
  {autofocus}
  {draftKey}
  {oncancel}
  onsubmit={submit}
>
  {#if scopes}
    <label class="share">
      <input type="checkbox" bind:checked={shared} />
      <span>{t("comment.share")}</span>
    </label>
  {/if}
</Composer>

<style>
  .share {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
    cursor: pointer;
  }
  .share input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }
</style>
