<script lang="ts">
  import type { ThreadScope } from "../../../../../../src/pub/protocol.ts";
  import Button from "../../../common/ui/button.svelte";
  import SegmentedControl from "../../../common/ui/segmented-control.svelte";
  import { useApp } from "../../../shell/use-app.ts";
  import type { ReplyInput } from "../type.ts";

  let {
    scopes = false,
    placeholder,
    submitLabel,
    compact = false,
    autofocus = false,
    oncancel,
    onsubmit,
  }: {
    /** Offer to keep the thread to the team, as it is unless changed, or share it with the client. */
    scopes?: boolean;
    placeholder?: string;
    submitLabel?: string;
    compact?: boolean;
    autofocus?: boolean;
    oncancel?: () => void;
    onsubmit: (input: ReplyInput) => Promise<boolean>;
  } = $props();

  const { t } = useApp();
  let text = $state("");
  let scope: ThreadScope = $state("team");
  let sending = $state(false);
  let field: HTMLTextAreaElement | undefined = $state();
  const uid = $props.id();

  $effect(() => {
    if (autofocus && field) {
      field.focus({ preventScroll: true });
    }
  });

  export function focus() {
    field?.focus();
  }

  async function submit() {
    if (!text.trim()) {
      field?.focus();
      return;
    }
    sending = true;
    const ok = await onsubmit({ text: text.trim(), ...(scopes ? { scope } : {}) });
    sending = false;
    if (ok) {
      text = "";
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && !text) {
      event.preventDefault();
      oncancel?.();
    }
  }
</script>

<form
  class="composer"
  class:compact
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
>
  <label class="visually-hidden" for="dek-text-{uid}">{placeholder ?? t("comment.placeholder")}</label>
  <textarea
    id="dek-text-{uid}"
    bind:this={field}
    bind:value={text}
    placeholder={placeholder ?? t("comment.placeholder")}
    rows="1"
    maxlength="4000"
    {onkeydown}
  ></textarea>
  {#if scopes}
    <div class="scope">
      <SegmentedControl
        label={t("comment.scope")}
        options={[
          { value: "team", label: t("comment.scope.team"), icon: "lock" },
          { value: "shared", label: t("comment.scope.shared") },
        ]}
        value={scope}
        onselect={(next: ThreadScope) => (scope = next)}
      />
    </div>
  {/if}
  <div class="row">
    <span class="hint" aria-hidden="true">{t("comment.shortcut")}</span>
    {#if oncancel}
      <Button variant="ghost" size="sm" onclick={oncancel}>{t("common.cancel")}</Button>
    {/if}
    <Button variant="primary" size="sm" type="submit" loading={sending}>
      {submitLabel ?? t("comment.post")}
    </Button>
  </div>
</form>

<style>
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .scope {
    display: flex;
  }
  label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text);
  }
  textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-base);
    line-height: var(--leading-ui);
    transition: border-color var(--dur-instant) var(--ease-out);
  }
  textarea {
    min-height: 40px;
    max-height: calc(8lh + 16px);
    resize: none;
    field-sizing: content;
  }
  textarea:hover {
    border-color: var(--text-faint);
  }
  textarea:focus-visible {
    border-color: var(--accent);
    outline-offset: 0;
  }
  @media (min-width: 768px) {
    textarea {
      font-size: var(--text-md);
    }
  }
  .compact textarea {
    min-height: 36px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .hint {
    margin-right: auto;
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
  @media (pointer: coarse) {
    .hint {
      visibility: hidden;
    }
  }
</style>
