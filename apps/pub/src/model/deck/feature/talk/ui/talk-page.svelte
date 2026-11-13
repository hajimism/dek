<script lang="ts">
  import { untrack } from "svelte";
  import type {
    LikeState,
    NewComment,
    NewPublicComment,
    PublicComment,
  } from "../../../../../../../../src/pub/protocol.ts";
  import { formatDate } from "../../../../../common/i18n.ts";
  import { ApiFailure, api } from "../../../../../common/ui/api.ts";
  import Button from "../../../../../common/ui/button.svelte";
  import Icon from "../../../../../common/ui/icon.svelte";
  import SegmentedControl from "../../../../../common/ui/segmented-control.svelte";
  import { toast } from "../../../../../common/ui/toast.svelte.ts";
  import { useApp } from "../../../../../shell/use-app.ts";
  import { CommentList } from "../../../../comment/client.svelte.ts";
  import PublicComments from "../../../../comment/public/ui/public-comments.svelte";
  import type { CardComment, Draft, Filter, ReplyInput } from "../../../../comment/type.ts";
  import CommentsPanel from "../../../../comment/ui/comments-panel.svelte";
  import { byPosition, elementOf } from "../../../../comment/view.ts";
  import { profilePath } from "../../../../person/profile-path.ts";
  import Avatar from "../../../../person/ui/avatar.svelte";
  import { talkPath } from "../../../deck.ts";
  import LikeButton from "../../../like/ui/like-button.svelte";
  import TalkCardView from "../../../ui/talk-card.svelte";
  import VisibilityBadge from "../../../ui/visibility-badge.svelte";
  import { DeckLink } from "../deck-link.svelte.ts";
  import { withSlide } from "../embed.ts";
  import type { QuoteSelection, Talk } from "../type.ts";
  import Article from "./article.svelte";
  import Theater from "./theater.svelte";
  import VersionPicker from "./version-picker.svelte";
  import Viewer from "./viewer.svelte";

  let { talk }: { talk: Talk } = $props();

  const { shared, lang, t } = useApp();
  const commentsOn = $derived(talk.comments !== null);
  const guest = $derived(talk.canComment && !shared.viewer);
  const slideNumbers = $derived(new Map(talk.slides.map((slide, i) => [slide.slug, i + 1])));
  const slugs = $derived(talk.slides.map((slide) => slide.slug));
  const contentLang = $derived(talk.lang ?? lang);

  // The page is keyed by the talk, so what it starts from is read once.
  const list = new CommentList(
    untrack(() => talk.id),
    untrack(() => talk.comments ?? []),
    (error) => toast(failure(error), { tone: "error" }),
  );
  const comments = $derived(list.rows);
  let muted = $state(untrack(() => talk.muted));

  /** Turn the reader's mail of these comments off or on, showing the change before it is made. */
  async function setMuted(next: boolean) {
    const before = muted;
    muted = next;
    try {
      await api(`/api/decks/${encodeURIComponent(talk.id)}/mute`, { method: next ? "PUT" : "DELETE" });
      toast(t(next ? "comment.muted" : "comment.unmuted"));
    } catch (error) {
      muted = before;
      toast(failure(error), { tone: "error" });
    }
  }
  let filter: Filter = $state("open");
  let selectedId: string | null = $state(null);
  let draft: Draft | null = $state(null);
  let panelOpen = $state(false);
  let sheetTall = $state(false);
  let mode: "column" | "drawer" | "sheet" = $state("column");
  let src = $state(untrack(() => talk.viewer.src));
  let frame: HTMLIFrameElement | undefined = $state();
  let viewer: Viewer | undefined = $state();
  let initialSlug: string | null = null;

  const link = new DeckLink({
    origin: untrack(() => talk.viewer.origin),
    slugs: untrack(() => talk.slides.map((slide) => slide.slug)),
    canRead: untrack(() => talk.comments !== null),
    canComment: untrack(() => talk.canComment),
    hasComment: (id) => comments.some((comment) => comment.id === id && !comment.pending),
    events: {
    onpicked: ({ slug, step, target }) => {
      draft = { anchor: { slug, step, targets: [target] }, slideNumber: slideNumbers.get(slug) ?? null };
      if (immersive) {
        reviewing = true;
        return;
      }
      openPanel();
      if (mode === "column") {
        // The new card sits beside the slide's picture in the article; bring the two into view.
        requestAnimationFrame(() =>
          document.getElementById(slug)?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    },
    onmark: (id) => select(id, { reveal: "card" }),
    onkey: () => theater?.toggleReview(),
    },
  });

  // Full screen: the theater holds the viewer, and in review mode the panel beside it, showing the
  // slide on screen's threads or all of them.
  let theater: Theater | undefined = $state();
  let immersive = $state(false);
  let reviewing = $state(false);
  let reviewScope = $state<"slide" | "all">("slide");

  const sorted = $derived(byPosition(comments, talk.slides));
  const theaterComments = $derived(
    reviewScope === "all" ? sorted : sorted.filter((comment) => comment.slug === link.current?.slug),
  );
  let aside: HTMLElement | undefined = $state();
  let articleCol: HTMLElement | undefined = $state();
  let anchorTops: Map<string, number> | null = $state(null);

  /** Where each comment's anchor is, from the top of the card list, for the margin beside the article. */
  function measure() {
    const list = aside?.querySelector<HTMLElement>(".cards") ?? aside?.querySelector<HTMLElement>(".list");
    if (mode !== "column" || !list) {
      anchorTops = null;
      return;
    }
    const base = list.getBoundingClientRect().top;
    const tops = new Map<string, number>();
    const place = (id: string, element: Element | null) => {
      if (element) {
        tops.set(id, element.getBoundingClientRect().top - base);
      }
    };
    for (const comment of comments) {
      const id = CSS.escape(comment.id);
      place(
        comment.id,
        document.querySelector(`mark[data-ids~="${id}"]`) ??
          document.querySelector(`.pin[data-id="${id}"]`)?.closest("figure") ??
          document.getElementById(comment.slug),
      );
    }
    if (draft) {
      const target = draft.anchor.targets[0];
      const holder = document.querySelector(`[data-slug="${CSS.escape(draft.anchor.slug)}"]`);
      const paragraph =
        target?.kind === "quote"
          ? [...(holder?.querySelectorAll("p[data-p]") ?? [])].find((p) => p.textContent?.includes(target.quote))
          : null;
      place("__draft", paragraph ?? (target?.kind === "element" ? document.getElementById(draft.anchor.slug)?.closest("section")?.querySelector("figure") ?? null : document.getElementById(draft.anchor.slug)));
    }
    anchorTops = tops;
  }

  $effect(() => {
    // Measured again whenever what is shown, or where, may have changed.
    void [comments.length, comments.map((comment) => comment.status).join(), draft, filter, mode, selectedId];
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!articleCol) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(articleCol);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
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
    const hash = readHash();
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
      if (!untrack(() => link.ready)) {
        // A deck that has not said it is ready, or never will, still opens at the slide.
        src = withSlide(src, hash);
      }
    }
  });

  $effect(() => {
    if (link.ready && initialSlug) {
      const slug = initialSlug;
      initialSlug = null;
      // A deck just started may still be settling where it opens; ask again until it is there.
      const tries = [0, 400, 1200].map((delay) =>
        setTimeout(() => {
          if (untrack(() => link.current?.slug) !== slug) {
            link.goto(slug);
          }
        }, delay),
      );
      return () => {
        for (const timer of tries) {
          clearTimeout(timer);
        }
      };
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

  /** The fragment, decoded; a fragment that is not valid percent-encoding names nothing. */
  function readHash(): string {
    try {
      return decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return "";
    }
  }

  let returnFocus: HTMLElement | null = null;

  /** Open the drawer or sheet, moving focus to its heading; in the column it is always open. */
  function openPanel() {
    if (mode === "column" || panelOpen) {
      return;
    }
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelOpen = true;
    requestAnimationFrame(() => aside?.querySelector<HTMLElement>("[data-panel-title]")?.focus({ preventScroll: true }));
  }

  /** Close it, and give focus back to what opened it unless the reader is sent elsewhere. */
  function closePanel(restore = true) {
    if (!panelOpen) {
      return;
    }
    panelOpen = false;
    if (restore) {
      const back = returnFocus;
      // The pill that opened the sheet is drawn again only once it is closed.
      requestAnimationFrame(() =>
        (back?.isConnected ? back : document.querySelector<HTMLElement>(".pill"))?.focus({
          preventScroll: true,
        }),
      );
    }
    returnFocus = null;
  }

  // While the sheet covers the page, what is behind it is out of reach.
  $effect(() => {
    if (mode !== "sheet" || !panelOpen) {
      return;
    }
    const behind = [
      ...document.querySelectorAll<HTMLElement>(
        "header.header, footer.footer, #dek-main > :not(.body), .body > :not(#dek-comments)",
      ),
    ];
    for (const element of behind) {
      element.inert = true;
    }
    return () => {
      for (const element of behind) {
        element.inert = false;
      }
    };
  });

  function scrollToViewer() {
    frame?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // The deck takes the keys from here on, so the arrows turn its slides.
  function showSlide(slug: string) {
    if (link.ready) {
      link.goto(slug);
    } else {
      src = withSlide(src, slug);
    }
    viewer?.focusDeck();
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
      closePanel(false);
    }
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (elementOf(comment) && link.ready) {
      link.goto(comment.slug, comment.step);
    }
  }

  function failure(error: unknown): string {
    if (error instanceof ApiFailure) {
      return error.code === "offline" ? t("common.offline") : t("common.error", { message: error.message });
    }
    return t("common.error", { message: "" });
  }

  async function create(input: ReplyInput): Promise<boolean> {
    if (!draft) {
      return false;
    }
    const body: NewComment = {
      anchor: $state.snapshot(draft.anchor),
      text: input.text,
      version: talk.version,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.guestName ? { guestName: input.guestName } : {}),
      ...(input.turnstile ? { turnstile: input.turnstile } : {}),
    };
    const author = shared.viewer
      ? { name: shared.viewer.name, handle: shared.viewer.handle, guest: false }
      : { name: input.guestName ?? "", guest: true };
    draft = null;
    const row = await list.create(body, author);
    if (row) {
      select(row.id);
    }
    return true;
  }

  async function retry(comment: CardComment) {
    const row = await list.retry(comment);
    if (row) {
      select(row.id);
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
    return `/signin?next=${encodeURIComponent(talkPath(talk.owner.handle, talk.slug))}`;
  }

  // The public comments and the likes, below the article: the page asks the server again after
  // each change, as they are few and anyone's.
  let publicList: PublicComment[] | null = $state(untrack(() => talk.publicComments));
  let likes: LikeState | null = $state(untrack(() => talk.likes));
  const publicPath = $derived(`/api/decks/${encodeURIComponent(talk.id)}/public-comments`);

  async function reloadPublic() {
    publicList = (await api<{ comments: PublicComment[] }>(publicPath)).comments;
  }

  async function publicChange(change: () => Promise<unknown>): Promise<boolean> {
    try {
      await change();
      await reloadPublic();
      return true;
    } catch (error) {
      toast(failure(error), { tone: "error" });
      return false;
    }
  }

  async function like(next: boolean) {
    if (!likes) {
      return;
    }
    const before = likes;
    likes = { count: likes.count + (next ? 1 : -1), liked: next };
    try {
      likes = await api<LikeState>(`/api/decks/${encodeURIComponent(talk.id)}/like`, { method: next ? "PUT" : "DELETE" });
    } catch (error) {
      likes = before;
      toast(failure(error), { tone: "error" });
    }
  }
</script>

{#snippet review(inTheater: boolean)}
  <CommentsPanel
    comments={inTheater ? theaterComments : sorted}
    {slideNumbers}
    bind:filter
    {selectedId}
    {draft}
    isOwner={talk.isOwner}
    canComment={talk.canComment}
    scopes={talk.side === "team"}
    {guest}
    closable={inTheater || mode !== "column"}
    {muted}
    onmute={setMuted}
    anchorTops={!inTheater && mode === "column" ? anchorTops : null}
    onclose={() => (inTheater ? (reviewing = false) : closePanel())}
    onselect={(comment) => select(comment.id)}
    onanchor={(comment) => {
      select(comment.id);
      if (inTheater) {
        link.goto(comment.slug, comment.step);
      } else {
        revealAnchor(comment);
      }
    }}
    onresolve={(comment) => list.setResolved(comment, true)}
    onreopen={(comment) => list.setResolved(comment, false)}
    onwiden={async (comment) => {
      if (await list.widen(comment)) {
        toast(t("comment.widened"));
      }
    }}
    onreply={(comment, input) => list.reply(comment, input)}
    oncreate={create}
    oncanceldraft={() => (draft = null)}
    onretry={retry}
    oncopylink={(comment) => copy(`${talk.url}#${comment.id}`, t("comment.linkCopied"))}
  />
{/snippet}

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented && panelOpen && mode !== "column") {
      event.preventDefault();
      closePanel();
    }
  }}
/>

{#if talk.versions && (talk.versions.length > 1 || talk.version !== talk.current)}
  <div class="version-row" lang={lang}>
    <VersionPicker
      versions={talk.versions}
      version={talk.version}
      current={talk.current}
      onpick={(n) => {
        const url = new URL(window.location.href);
        if (n === talk.current) {
          url.searchParams.delete("v");
        } else {
          url.searchParams.set("v", String(n));
        }
        url.hash = "";
        window.location.assign(url);
      }}
    />
  </div>
{/if}

<div class="theater-slot">
<Theater
  bind:this={theater}
  bind:immersive
  bind:reviewing
  title={talk.title}
  author={talk.owner.name}
  position={link.ready && link.current ? `${link.current.index + 1} / ${link.slides.length}` : null}
  reviewCount={commentsOn ? openCount : null}
>
  {#snippet stage()}
    <Viewer
      bind:this={viewer}
      {immersive}
      onfullscreen={() => theater?.enter()}
      src={src}
      title={talk.title}
      url={talk.url}
      {slugs}
      {link}
      bind:frame
      canComment={talk.canComment}
      oncommentslide={commentOnSlide}
    />
  {/snippet}
  {#snippet extra()}
    {#if likes}
      <LikeButton {likes} canLike={shared.viewer !== null} signinHref={signinHref()} onlike={like} />
    {/if}
  {/snippet}
  {#snippet panel()}
    <div class="theater-review" lang={lang}>
      <div class="theater-tools">
        <SegmentedControl
          label={t("talk.comments")}
          options={[
            { value: "slide", label: t("talk.thisSlide") },
            { value: "all", label: t("talk.allSlides") },
          ]}
          value={reviewScope}
          onselect={(next: "slide" | "all") => (reviewScope = next)}
        />
        {#if talk.canComment && link.ready && link.current}
          <Button variant="ghost" size="sm" icon="crosshair" onclick={() => link.current && commentOnSlide(link.current.slug)}>
            {t("comment.onSlide")}
          </Button>
        {/if}
      </div>
      {@render review(true)}
    </div>
  {/snippet}
</Theater>
</div>

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
      <a class="author" href={profilePath(talk.owner.handle)}>
        <Avatar name={talk.owner.name} image={talk.owner.image} size={32} />
        <span class="author-text">
          <span class="author-name">{talk.owner.name}</span>
          <span class="author-handle">@{talk.owner.handle}</span>
        </span>
      </a>
      <div class="actions" lang={lang}>
        {#if talk.isOwner}<VisibilityBadge visibility={talk.visibility} />{/if}
        <Button variant="ghost" icon="link" onclick={() => copy(talk.url, t("talk.shareCopied"))}>{t("talk.share")}</Button>
        {#if likes}
          <LikeButton {likes} canLike={shared.viewer !== null} signinHref={signinHref()} onlike={like} />
        {/if}
        {#if commentsOn}
          <Button
            variant="ghost"
            icon="message"
            class="comments-toggle"
            aria-expanded={mode === "column" ? undefined : panelOpen}
            aria-controls="dek-comments"
            onclick={() => {
              if (mode === "column") {
                document.getElementById("dek-comments")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              } else if (panelOpen) {
                closePanel();
              } else {
                openPanel();
              }
            }}
          >
            {t("talk.comments")} <span class="num count">{openCount}</span>
          </Button>
        {/if}
        {#if talk.isOwner}
          <Button variant="secondary" size="sm" href="{talkPath(talk.owner.handle, talk.slug)}/manage">{t("talk.manage")}</Button>
        {/if}
      </div>
    </div>
  </header>

  <div class="article-col" bind:this={articleCol}>
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
    {#if publicList}
      <div class="public-col" lang={lang}>
        <PublicComments
          comments={publicList}
          canPost={talk.canPostPublic}
          off={talk.commentPolicy === "off"}
          isOwner={talk.isOwner}
          signinHref={signinHref()}
          onpost={(input, parentId) =>
            publicChange(() => {
              const body: NewPublicComment = {
                text: input.text,
                ...(parentId ? { parentId } : {}),
                ...(input.guestName ? { guestName: input.guestName } : {}),
                ...(input.turnstile ? { turnstile: input.turnstile } : {}),
              };
              return api(publicPath, { method: "POST", body });
            })}
          onedit={(id, text) =>
            publicChange(() => api(`${publicPath}/${encodeURIComponent(id)}`, { method: "PATCH", body: { text } }))}
          ondelete={async (id) => {
            await publicChange(() => api(`${publicPath}/${encodeURIComponent(id)}`, { method: "DELETE" }));
          }}
        />
      </div>
    {/if}
  </div>

  {#if commentsOn}
    {#if mode === "sheet" && panelOpen}
      <button type="button" class="scrim" tabindex="-1" aria-label={t("comment.close")} onclick={() => closePanel()}></button>
    {/if}
    <aside
      bind:this={aside}
      id="dek-comments"
      class="comments {mode}"
      class:open={panelOpen}
      class:tall={sheetTall}
      role={mode === "column" ? undefined : "dialog"}
      aria-modal={mode === "sheet" && panelOpen ? "true" : undefined}
      aria-labelledby="dek-comments-title"
      inert={mode !== "column" && !panelOpen}
    >
      {#if mode === "sheet"}
        <button
          type="button"
          class="grabber"
          aria-label={sheetTall ? t("comment.collapse") : t("comment.expand")}
          aria-expanded={sheetTall}
          onclick={() => (sheetTall = !sheetTall)}
        ><span></span></button>
      {/if}
      {@render review(false)}
    </aside>
    {#if mode !== "column" && !panelOpen}
      <button type="button" class="pill" aria-controls="dek-comments" aria-expanded="false" onclick={openPanel}>
        <Icon name="message" />{t("talk.comments")}<span class="num">{openCount}</span>
      </button>
    {/if}
  {/if}
</div>

{#if talk.more.length > 0}
  <section class="more" aria-labelledby="dek-more-title">
    <h2 id="dek-more-title">{t("talk.moreBy", { name: talk.owner.name })}</h2>
    <ul class="grid">
      {#each talk.more as card (card.slug)}
        <li><TalkCardView {card} /></li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* One left edge from the header down: the viewer's, the title's and the article's. Beside a
     column of comments, the comments end where the viewer does. */
  .theater-review {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    height: 100%;
  }
  .theater-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .public-col {
    margin-top: var(--space-12);
  }
  .version-row {
    max-width: var(--container);
    margin: 0 auto;
    padding: var(--space-4) var(--page-gutter) 0;
  }
  .version-row :global(.versions) {
    margin-bottom: 0;
  }
  @media (max-width: 767px) {
    /* The viewer is edge to edge here, with no space above it of its own. */
    .version-row {
      padding: var(--space-3) var(--page-gutter);
    }
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, var(--measure));
    max-width: var(--container);
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }
  @media (min-width: 1280px) {
    .body.with-comments {
      --measure: 48rem;
      grid-template-columns: minmax(0, var(--measure)) minmax(var(--space-12), 1fr) 320px;
    }
    .with-comments .title-block,
    .with-comments .article-col {
      grid-column: 1;
    }
    .with-comments .comments {
      grid-column: 3;
      grid-row: 2;
    }
  }
  .title-block {
    margin: var(--space-10) 0 var(--space-12);
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
  /* A borderless button last in the row ends at the text's edge with its label, not its padding. */
  .actions:has(> :global(.ghost:last-child)) {
    margin-right: -14px;
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
    padding: 0 10px 24px;
    margin: 0 -10px;
  }
  /* The heading and the filters stick as one piece, so nothing shows between them, and over the
     column's side padding, where a selected card leans out. */
  .comments.column :global(.panel-head) {
    position: sticky;
    top: var(--header-height);
    z-index: 2;
    margin: 0 -10px;
    padding: var(--space-3) 10px 0;
    background: var(--bg);
  }
  .comments.drawer,
  .comments.sheet {
    position: fixed;
    z-index: var(--z-drawer);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface-raised);
    box-shadow: var(--shadow-lg);
    transition: transform var(--dur-slow) var(--ease-out);
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
    /* Always 92% tall; at rest it is moved down to show 60%, so only transform animates. */
    height: 92dvh;
    padding: 0 var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    transform: translateY(100%);
  }
  .comments.drawer.open {
    transform: none;
  }
  .comments.sheet.open {
    transform: translateY(32dvh);
  }
  .comments.sheet.open.tall {
    transform: none;
  }
  /* The part moved below the screen at rest is padding, so the last card can still be read. */
  .comments.sheet.open:not(.tall) {
    padding-bottom: calc(32dvh + var(--space-4) + env(safe-area-inset-bottom));
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
