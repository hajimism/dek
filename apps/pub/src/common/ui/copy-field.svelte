<script lang="ts">
  
  import Icon from "./icon.svelte";
import { useI18n } from "./use-i18n.ts";

  let {
    value,
    label,
    kind = "url",
    prompt = false,
  }: { value: string; label: string; kind?: "url" | "command"; prompt?: boolean } = $props();
  const { t } = useI18n();
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 1600);
    } catch {
      copied = false;
    }
  }
</script>

<div class="field {kind}">
  <code aria-label={label}>{#if prompt}<span class="prompt" aria-hidden="true">$</span>{/if}{value}</code>
  <button type="button" class="copy" onclick={copy} aria-label={copied ? t("common.copied") : `${t("common.copy")}: ${label}`}>
    <Icon name={copied ? "check" : "copy"} size={14} />
    <span class="copy-label" aria-hidden="true">{copied ? t("common.copied") : t("common.copy")}</span>
  </button>
  <span class="visually-hidden" role="status">{copied ? t("common.copied") : ""}</span>
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    height: 44px;
    padding: 0 6px 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .command {
    background: var(--bg-subtle);
  }
  code {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    white-space: nowrap;
    font-size: var(--text-md);
    color: var(--text);
    scrollbar-width: none;
  }
  .prompt {
    margin-right: 0.6ch;
    color: var(--text-faint);
    user-select: none;
  }
  .copy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    flex-shrink: 0;
  }
  .copy:hover {
    background: var(--bg-active);
    color: var(--text);
  }
</style>
