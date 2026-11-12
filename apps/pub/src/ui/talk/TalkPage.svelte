<script lang="ts">
  import { untrack } from "svelte";
  import type { CommentRow, CommentTarget, NewComment } from "../../../../../src/pub/protocol.ts";
  import { byPosition, elementOf, type Filter } from "../../lib/comment-view.ts";
  import { withSlide } from "../../lib/embed.ts";
  import { formatDate } from "../../lib/i18n.ts";
  import type { Talk } from "../../server/pages.ts";
  import Avatar from "../Avatar.svelte";
  import { ApiFailure, api } from "../api.ts";
  import { useApp } from "../app.ts";
  import Button from "../Button.svelte";
  import type { CardComment, ReplyInput } from "../comments/CommentCard.svelte";
  import CommentsPanel, { type Draft } from "../comments/CommentsPanel.svelte";
  import Icon from "../Icon.svelte";
  import TalkCardView from "../TalkCard.svelte";
  import { toast } from "../toast.svelte.ts";
  import VisibilityBadge from "../VisibilityBadge.svelte";
  import Article, { type QuoteSelection } from "./Article.svelte";
  import { DeckLink } from "./deck-link.svelte.ts";
  import Viewer from "./Viewer.svelte";

  let { talk }: { talk: Talk } = $props();

  const { shared, lang, t } = useApp();
  const commentsOn = $derived(talk.comments !== null);
  const guest = $derived(talk.canComment && !shared.viewer);
  const slideNumbers = $derived(new Map(talk.slides.map((slide, i) => [slide.slug, i + 1])));
  const slugs = $derived(talk.slides.map((slide) => slide.slug));
  const contentLang = $derived(talk.lang ?? lang);

  // The page is keyed by the talk, so what it starts from is read once.
  let comments: CardComment[] = $state(untrack(() => talk.comments ?? []));
  let filter: Filter = $state("open");
  let selectedId: string | null = $state(null);
  let draft: Draft | null = $state(null);
  let panelOpen = $state(false);
  let sheetTall = $state(false);
  let mode: "column" | "drawer" | "sheet" = $state("column");
  let src = $state(untrack(() => talk.viewer.src));
  let frame: HTMLIFrameElement | undefined = $state();
  let initialSlug: string | null = null;
  const unsent = new Map<string, NewComment>();
  let tempCount = 0;

  const link = new DeckLink(untrack(() => talk.viewer.origin), {
    onpicked: ({ slug, step, target }) => {
      draft = { anchor: { slug, step, targets: [target] }, slideNumber: slideNumbers.get(slug) ?? null };
      openPanel();
    },
    onmark: (id) => select(id, { reveal: "card" }),
  });

  const sorted = $derived(byPosition(comments, talk.slides));
  const openCount = $derived(comments.filter((comment) => comment.status !== "resolved").length);

  // How the comments sit: a column beside the article, a drawer, or a sheet from the bottom.
  $effect(() => {
    const wide = window.matchMedia("(min-width: 1280px)");
    const mid = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      mode = wide.matches ? "column" : mid.matches ? "drawer" : "sheet";
    };
    update();
    wide.addEventListener("change", update);
    mid.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      mid.removeEventListener("change", update);
    };
  });

  // A link to a slide or a comment opens there.
  $effect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) {
      return;
    }
    if (hash.startsWith("c_")) {
      const comment = comments.find((candidate) => candidate.id === hash);
      if (comment) {
        if (comment.status === "resolved") {
          filter = "all";
        }
        queueMicrotask(() => select(hash, { reveal: "both" }));
      }
    } else if (slugs.includes(hash)) {
      initialSlug = hash;
      src = withSlide(src, hash);
    }
  });

  $effect(() => {
    if (link.ready && initialSlug) {
      link.goto(initialSlug);
      initialSlug = null;
    }
  });

  // The deck draws numbered marks of its own for the element comments on the slide it shows.
  $effect(() => {
    if (!link.ready || !commentsOn) {
      return;
    }
    const slug = link.current?.slug;
    const marks = comments.flatMap((comment) => {
      const element = elementOf(comment);
      return element && comment.slug === slug && comment.status !== "resolved" && !comment.pending
        ? [{ id: comment.id, number: comment.number, slug: comment.slug, step: comment.step, box: element.box }]
        : [];
    });
    link.marks(marks);
  });

  function openPanel() {
    if (mode !== "column") {
      panelOpen = true;
    }
  }

  function scrollToViewer() {
    frame?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showSlide(slug: string) {
    if (link.ready) {
      link.goto(slug);
    } else {
      src = withSlide(src, slug);
    }
    scrollToViewer();
  }

  function commentOnSlide(slug: string) {
    if (!talk.canComment) {
      return;
    }
    if (link.ready) {
      link.goto(slug);
      link.pick(true);
      scrollToViewer();
      return;
    }
    draft = { anchor: { slug, step: "0", targets: [] }, slideNumber: slideNumbers.get(slug) ?? null };
    openPanel();
  }

  function commentOnQuote(selection: QuoteSelection) {
    draft = {
      anchor: { slug: selection.slug, step: "0", targets: [{ kind: "quote", ...selection.quote }] },
      slideNumber: slideNumbers.get(selection.slug) ?? null,
    };
    if (filter === "resolved") {
      filter = "open";
    }
    openPanel();
  }

  function select(id: string, options: { reveal?: "card" | "anchor" | "both" } = {}) {
    selectedId = id;
    history.replaceState(history.state, "", `#${id}`);
    const comment = comments.find((candidate) => candidate.id === id);
    if (comment && comment.status === "resolved" && filter === "open") {
      filter = "all";
    }
    if (options.reveal === "card" || options.reveal === "both") {
      openPanel();
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    }
    if ((options.reveal === "anchor" || options.reveal === "both") && comment) {
      revealAnchor(comment);
    }
  }

  function revealAnchor(comment: CardComment) {
    const mark = document.querySelector<HTMLElement>(`mark[data-ids~="${CSS.escape(comment.id)}"]`);
    const target = mark ?? document.getElementById(comment.slug);
    if (mode === "sheet") {
      panelOpen = false;
    }
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (elementOf(comment) && link.ready) {
      link.goto(comment.slug, comment.step);
    }
  }

  function replace(row: CommentRow, oldId = row.id) {
    const at = comments.findIndex((comment) => comment.id === oldId);
    if (at === -1) {
      comments.push(row);
    } else {
      comments[at] = row;
    }
  }

  function failure(error: unknown): string {
    if (error instanceof ApiFailure) {
      return error.code === "offline" ? t("common.offline") : t("common.error", { message: error.message });
    }
    return t("common.error", { message: "" });
  }

  async function send(id: string, body: NewComment) {
    try {
      const row = await api<CommentRow>(`/api/decks/${talk.id}/comments`, { method: "POST", body });
      unsent.delete(id);
      replace(row, id);
      select(row.id);
    } catch (error) {
      const at = comments.findIndex((comment) => comment.id === id);
      const card = comments[at];
      if (card) {
        comments[at] = { ...card, pending: false, failed: true };
      }
      toast(failure(error), { tone: "error" });
    }
  }

  async function create(input: ReplyInput): Promise<boolean> {
    if (!draft) {
      return false;
    }
    const body: NewComment & { version: number } = {
      anchor: $state.snapshot(draft.anchor),
      text: input.text,
      version: talk.version,
      ...(input.guestName ? { guestName: input.guestName } : {}),
      ...(input.turnstile ? { turnstile: input.turnstile } : {}),
    };
    const id = `tmp_${++tempCount}`;
    const highest = comments.reduce((max, comment) => Math.max(max, comment.number), 0);
    comments.push({
      number: highest + 1,
      id,
      slug: draft.anchor.slug,
      step: draft.anchor.step,
      status: "open",
      text: input.text,
      targets: draft.anchor.targets as CommentTarget[],
      author: shared.viewer
        ? { name: shared.viewer.name, handle: shared.viewer.handle, guest: false }
        : { name: input.guestName ?? "", guest: true },
      version: talk.version,
      url: "",
      thread: [],
      createdAt: new Date(shared.now).toISOString(),
      resolvedAt: null,
      pending: true,
    });
    unsent.set(id, body);
    draft = null;
    await send(id, body);
    return true;
  }

  function retry(comment: CardComment) {
    const body = unsent.get(comment.id);
    if (!body) {
      return;
    }
    replace({ ...comment, pending: true, failed: false } as CardComment, comment.id);
    send(comment.id, body);
  }

  async function reply(comment: CardComment, input: ReplyInput): Promise<boolean> {
    try {
      replace(
        await api<CommentRow>(`/api/decks/${talk.id}/comments/${comment.id}/replies`, {
          method: "POST",
          body: input,
        }),
      );
      return true;
    } catch (error) {
      toast(failure(error), { tone: "error" });
      return false;
    }
  }

  async function setResolved(comment: CardComment, resolved: boolean) {
    try {
      replace(
        await api<CommentRow>(`/api/decks/${talk.id}/comments/${comment.id}/${resolved ? "resolve" : "reopen"}`, {
          method: "POST",
        }),
      );
    } catch (error) {
      toast(failure(error), { tone: "error" });
    }
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast(text);
    }
  }

  function signinHref(): string {
    return `/signin?next=${encodeURIComponent(`/@${talk.owner.handle}/${talk.slug}`)}`;
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && panelOpen && mode !== "column") {
      panelOpen = false;
    }
  }}
/>

<Viewer
  src={src}
  title={talk.title}
  url={talk.url}
  {slugs}
  {link}
  bind:frame
  canComment={talk.canComment}
  oncommentslide={commentOnSlide}
/>

<div class="body" class:with-comments={commentsOn}>
  <header class="title-block" lang={contentLang}>
    {#if talk.event || talk.date}
      <p class="eyebrow">
        {#if talk.event}<span>{talk.event}</span>{/if}
        {#if talk.event && talk.date}<span aria-hidden="true">·</span>{/if}
        {#if talk.date}<time datetime={talk.date}>{formatDate(lang, talk.date)}</time>{/if}
      </p>
    {/if}
    <h1>{talk.title}</h1>
    {#if talk.description}<p class="lead">{talk.description}</p>{/if}
    <div class="byline">
      <a class="author" href="/@{talk.owner.handle}">
        <Avatar name={talk.owner.name} image={talk.owner.image} size={32} />
        <span class="author-text">
          <span class="author-name">{talk.owner.name}</span>
          <span class="author-handle">@{talk.owner.handle}</span>
        </span>
      </a>
      <div class="actions" lang={lang}>
        {#if talk.isOwner}<VisibilityBadge visibility={talk.visibility} />{/if}
        <Button variant="ghost" icon="link" onclick={() => copy(talk.url, t("talk.shareCopied"))}>{t("talk.share")}</Button>
        {#if commentsOn}
          <Button
            variant="ghost"
            icon="message"
            class="comments-toggle"
            aria-expanded={mode === "column" ? undefined : panelOpen}
            aria-controls="comments"
            onclick={() => {
              if (mode === "column") {
                document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              } else {
                panelOpen = !panelOpen;
              }
            }}
          >
            {t("talk.comments")} <span class="num count">{openCount}</span>
          </Button>
        {:else if !shared.viewer && talk.commentPolicy !== "off" && talk.visibility !== "private"}
          <Button variant="ghost" icon="message" href={signinHref()}>{t("comment.signinToComment")}</Button>
        {/if}
        {#if talk.isOwner}
          <Button variant="secondary" size="sm" href="/@{talk.owner.handle}/{talk.slug}/manage">{t("talk.manage")}</Button>
        {/if}
      </div>
    </div>
  </header>

  <div class="article-col">
    <Article
      slides={talk.slides}
      lang={contentLang}
      script={talk.script}
      comments={commentsOn ? comments.filter((comment) => !comment.pending) : []}
      {selectedId}
      size={link.size}
      canComment={talk.canComment}
      onselect={(id) => select(id, { reveal: "card" })}
      onshowslide={showSlide}
      oncommentslide={commentOnSlide}
      oncommentquote={commentOnQuote}
    />
  </div>

  {#if commentsOn}
    {#if mode === "sheet" && panelOpen}
      <button type="button" class="scrim" aria-label={t("comment.close")} onclick={() => (panelOpen = false)}></button>
    {/if}
    <aside
      id="comments"
      class="comments {mode}"
      class:open={panelOpen}
      class:tall={sheetTall}
      aria-label={t("talk.comments")}
      inert={mode !== "column" && !panelOpen}
    >
      {#if mode === "sheet"}
        <button
          type="button"
          class="grabber"
          aria-label={sheetTall ? "↓" : "↑"}
          onclick={() => (sheetTall = !sheetTall)}
        ><span></span></button>
      {/if}
      <CommentsPanel
        comments={sorted}
        {slideNumbers}
        bind:filter
        {selectedId}
        {draft}
        isOwner={talk.isOwner}
        canComment={talk.canComment}
        {guest}
        closable={mode !== "column"}
        onclose={() => (panelOpen = false)}
        onselect={(comment) => select(comment.id)}
        onanchor={(comment) => {
          select(comment.id);
          revealAnchor(comment);
        }}
        onresolve={(comment) => setResolved(comment, true)}
        onreopen={(comment) => setResolved(comment, false)}
        onreply={reply}
        oncreate={create}
        oncanceldraft={() => (draft = null)}
        onretry={retry}
        oncopylink={(comment) => copy(`${talk.url}#${comment.id}`, t("comment.linkCopied"))}
      />
    </aside>
    {#if mode !== "column" && !panelOpen}
      <button type="button" class="pill" onclick={() => (panelOpen = true)}>
        <Icon name="message" />{t("talk.comments")}<span class="num">{openCount}</span>
      </button>
    {/if}
  {/if}
</div>

{#if talk.more.length > 0}
  <section class="more" aria-labelledby="more-title">
    <h2 id="more-title">{t("talk.moreBy", { name: talk.owner.name })}</h2>
    <ul class="grid">
      {#each talk.more as card (card.slug)}
        <li><TalkCardView {card} /></li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    max-width: var(--container);
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }
  @media (min-width: 1280px) {
    .body.with-comments {
      grid-template-columns: minmax(0, 1fr) minmax(0, var(--measure-wide)) 40px 320px minmax(0, 1fr);
      max-width: none;
      padding: 0 var(--gutter-lg);
    }
    .with-comments .title-block,
    .with-comments .article-col {
      grid-column: 2;
    }
    .with-comments .comments {
      grid-column: 4;
      grid-row: 1 / span 2;
    }
  }
  .title-block {
    width: 100%;
    max-width: var(--measure-wide);
    margin: var(--space-10) auto var(--space-12);
  }
  .eyebrow {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
  }
  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
  }
  @media (min-width: 768px) {
    h1 {
      font-size: var(--text-3xl);
    }
  }
  .lead {
    max-width: var(--measure);
    margin-top: var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-base);
    line-height: var(--leading-read-en);
  }
  .lead:lang(ja) {
    line-height: var(--leading-read-ja);
  }
  .byline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-top: var(--space-6);
    padding-top: var(--space-6);
    border-top: 1px solid var(--border);
  }
  .author {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--text);
    text-decoration: none;
  }
  .author-text {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .author-name {
    font-weight: var(--weight-medium);
  }
  .author-handle {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .author:hover .author-name {
    text-decoration: underline;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .count {
    margin-left: 2px;
    color: var(--text-faint);
  }
  .article-col {
    min-width: 0;
  }

  .comments {
    min-width: 0;
  }
  .comments.column {
    position: sticky;
    top: calc(var(--header-height) + var(--space-4));
    align-self: start;
    max-height: calc(100dvh - var(--header-height) - var(--space-8));
    margin-top: var(--space-10);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 2px 10px 24px 10px;
    margin-left: -10px;
    margin-right: -10px;
  }
  .comments.drawer,
  .comments.sheet {
    position: fixed;
    z-index: var(--z-drawer);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface-raised);
    box-shadow: var(--shadow-lg);
    transition:
      transform var(--dur-slow) var(--ease-out),
      height var(--dur-slow) var(--ease-out);
  }
  .comments.drawer {
    top: var(--header-height);
    right: 0;
    bottom: 0;
    width: 360px;
    padding: var(--space-4);
    border-left: 1px solid var(--border);
    transform: translateX(100%);
  }
  .comments.sheet {
    left: 0;
    right: 0;
    bottom: 0;
    height: 60dvh;
    padding: 0 var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    transform: translateY(100%);
  }
  .comments.sheet.tall {
    height: 92dvh;
  }
  .comments.open {
    transform: none;
  }
  /* Before the script knows the width, the panel stays out of the way below 1280px. */
  @media (max-width: 1279px) {
    .comments.column {
      display: none;
    }
  }
  .grabber {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    place-items: center;
    width: calc(100% + 2 * var(--space-4));
    height: 28px;
    margin: 0 calc(-1 * var(--space-4)) var(--space-1);
    border: 0;
    background: var(--surface-raised);
    cursor: pointer;
  }
  .grabber span {
    width: 36px;
    height: 4px;
    border-radius: var(--radius-full);
    background: var(--border-hover);
  }
  .scrim {
    position: fixed;
    z-index: var(--z-drawer);
    inset: 0;
    border: 0;
    background: var(--overlay);
    animation: fade var(--dur-slow) var(--ease-out);
    cursor: default;
  }
  .pill {
    position: fixed;
    z-index: var(--z-sticky);
    right: var(--space-4);
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 44px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-md);
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .pill .num {
    color: var(--text-muted);
  }
  @media (min-width: 1024px) {
    .pill {
      display: none;
    }
  }
  .more {
    max-width: var(--container);
    margin: var(--space-16) auto 0;
    padding: var(--space-10) var(--page-gutter) 0;
    border-top: 1px solid var(--border);
  }
  .more h2 {
    margin-bottom: var(--space-6);
    font-size: var(--text-lg);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
