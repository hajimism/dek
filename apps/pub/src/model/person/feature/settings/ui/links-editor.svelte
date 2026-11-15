<script lang="ts">
  // The links a profile shows, edited as a list: each is checked as it is typed by the rules the
  // API saves it by, and shown as the profile will name it; the list is saved whole, in its order.
  import { tick, untrack } from "svelte";
  import Button from "../../../../../common/ui/button.svelte";
  import Icon from "../../../../../common/ui/icon.svelte";
  import { toast } from "../../../../../common/ui/toast.svelte.ts";
  import { useI18n } from "../../../../../common/ui/use-i18n.ts";
  import { type LinksProblem, MAX_LINK_LENGTH, MAX_LINKS, readLink, readLinks } from "../../../link.ts";
  import LinkFace from "../../../ui/link-face.svelte";
  import { saveLinks } from "../settings-api.ts";

  let { links }: { links: string[] } = $props();
  const { t } = useI18n();

  type Row = { key: number; value: string };
  let next = 0;
  const rowsOf = (values: readonly string[]): Row[] => values.map((value) => ({ key: next++, value }));

  let rows: Row[] = $state(untrack(() => rowsOf(links)));
  /** The rows a save found a problem in, by key, shown until the row is changed. */
  let refused: Map<number, LinksProblem> = $state(new Map());
  /** What dek.pub refused the list for, when the rules here let it through. */
  let failure: string | null = $state(null);
  let saving = $state(false);

  const filled = $derived(rows.filter((row) => row.value.trim() !== ""));

  /** What the row's field says under it: how the profile will name the link, or what is wrong with it. */
  function statusOf(row: Row): { problem: LinksProblem } | { url: string } | null {
    const problem = refused.get(row.key);
    if (problem) {
      return { problem };
    }
    const read = row.value.trim() === "" ? null : readLink(row.value);
    return read?.ok ? { url: read.url } : null;
  }

  function problemText(problem: LinksProblem | "offline" | "failed", message = ""): string {
    switch (problem) {
      case "too_long":
        return t("settings.links.too_long", { n: MAX_LINK_LENGTH });
      case "too_many":
        return t("settings.links.too_many", { n: MAX_LINKS });
      case "offline":
        return t("common.offline");
      case "failed":
        return t("common.error", { message });
      default:
        return t(`settings.links.${problem}`);
    }
  }

  function edit(row: Row, value: string) {
    row.value = value;
    if (refused.has(row.key)) {
      refused.delete(row.key);
      refused = new Map(refused);
    }
    failure = null;
  }

  async function focusField(key: number) {
    await tick();
    document.getElementById(`link-${key}`)?.focus();
  }

  function add() {
    const row = { key: next++, value: "" };
    rows.push(row);
    focusField(row.key);
  }

  async function move(at: number, by: -1 | 1) {
    const [row] = rows.splice(at, 1);
    if (row) {
      rows.splice(at + by, 0, row);
      // Focus stays on the button pressed, which moves with its row, unless the row reached the end
      // that button moves it to, where the button is off: then on the other.
      await tick();
      const to = at + by;
      const atEnd = by < 0 ? to === 0 : to === rows.length - 1;
      document.getElementById(`link-${row.key}-${by < 0 !== atEnd ? "up" : "down"}`)?.focus();
    }
  }

  function remove(at: number) {
    rows.splice(at, 1);
    const neighbour = rows[at] ?? rows[at - 1];
    if (neighbour) {
      focusField(neighbour.key);
    } else {
      tick().then(() => document.getElementById("link-add")?.focus());
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) {
      return;
    }
    // An empty row is no link; it goes with the save.
    const kept = filled;
    const read = readLinks(kept.map((row) => row.value));
    if (!read.ok) {
      const row = read.at === null ? undefined : kept[read.at];
      if (row) {
        refused = new Map([[row.key, read.problem]]);
        focusField(row.key);
      } else {
        failure = problemText(read.problem);
      }
      return;
    }
    saving = true;
    const result = await saveLinks(read.links);
    saving = false;
    if (!result.ok) {
      failure = problemText(result.problem, result.message);
      return;
    }
    rows = rowsOf(result.value);
    refused = new Map();
    failure = null;
    toast(t("saved"));
  }
</script>

<form class="links" onsubmit={submit} novalidate>
  {#if rows.length === 0}
    <p class="none">{t("settings.links.none")}</p>
  {:else}
    <ol>
      {#each rows as row, at (row.key)}
        {@const status = statusOf(row)}
        {@const n = at + 1}
        <li>
          <div class="row">
            <label class="visually-hidden" for="link-{row.key}">{t("settings.links.label", { n })}</label>
            <input
              id="link-{row.key}"
              type="url"
              inputmode="url"
              value={row.value}
              oninput={(event) => edit(row, event.currentTarget.value)}
              placeholder="https://"
              autocomplete="url"
              autocapitalize="none"
              spellcheck="false"
              aria-invalid={status !== null && "problem" in status}
              aria-describedby="link-{row.key}-status"
            />
            <Button id="link-{row.key}-up" variant="ghost" icon="arrow-up" iconOnly label={t("settings.links.up", { n })} disabled={at === 0} onclick={() => move(at, -1)} />
            <Button id="link-{row.key}-down" variant="ghost" icon="arrow-down" iconOnly label={t("settings.links.down", { n })} disabled={at === rows.length - 1} onclick={() => move(at, 1)} />
            <Button variant="ghost" icon="x" iconOnly label={t("settings.links.remove", { n })} onclick={() => remove(at)} />
          </div>
          <p id="link-{row.key}-status" class="status" class:problem={status !== null && "problem" in status} aria-live="polite">
            {#if status && "problem" in status}
              <Icon name="alert" size={14} />{problemText(status.problem)}
            {:else if status}
              <LinkFace url={status.url} />
            {/if}
          </p>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="add">
    <Button id="link-add" variant="secondary" icon="plus" disabled={rows.length >= MAX_LINKS} onclick={add}>{t("settings.links.add")}</Button>
    {#if rows.length >= MAX_LINKS}
      <p class="full">{t("settings.links.full", { n: MAX_LINKS })}</p>
    {/if}
  </div>

  {#if failure}
    <p class="failure" role="alert"><Icon name="alert" size={14} />{failure}</p>
  {/if}
  <div class="actions">
    <Button variant="primary" type="submit" loading={saving} disabled={saving}>{t("settings.links.save")}</Button>
  </div>
</form>

<style>
  .links {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  ol {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .row :global(.btn) {
    flex: none;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 40px;
    margin-right: var(--space-1);
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
  input:hover {
    border-color: var(--text-faint);
  }
  input:focus-visible {
    border-color: var(--accent);
    outline: none;
  }
  input[aria-invalid="true"] {
    border-color: var(--danger);
  }
  .status,
  .failure {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 1.5em;
    margin-top: var(--space-1);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }
  .status :global(svg),
  .failure :global(svg) {
    flex: none;
  }
  .status.problem,
  .failure {
    color: var(--danger);
  }
  .none,
  .full {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .actions {
    display: flex;
  }
</style>
