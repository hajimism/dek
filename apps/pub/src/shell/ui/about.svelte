<script lang="ts">
  import { docsUrl } from "../../common/docs.ts";
  import type { MessageKey } from "../../common/i18n.ts";
  import Button from "../../common/ui/button.svelte";
  import { profilePath } from "../../model/person/profile-path.ts";
  import { useApp } from "../use-app.ts";

  type Sample = { href: string; title: string; handle: string; picture: string | null };
  let { sample }: { sample: Sample | null } = $props();
  const { shared, lang, t } = useApp();

  const visibilities = ["team", "private", "link", "public"] as const;
  const listed = { team: "no", private: "no", link: "no", public: "yes" } as const;
  const people = ["reader", "speaker", "review"] as const;
  const refusals = [1, 2, 3, 4] as const;
  const commands = ["dekc pub login", "dekc pub publish", "dekc pub share --visibility link"];
  const more: ReadonlyArray<{ label: MessageKey; href: string }> = $derived([
    { label: "about.more.publish", href: docsUrl(lang, "guide/publish") },
    { label: "about.more.why", href: docsUrl(lang, "guide/why") },
    { label: "about.more.faq", href: docsUrl(lang, "guide/faq") },
    { label: "about.more.source", href: "https://github.com/hajimism/dek" },
  ]);
</script>

<article class="about">
  <header class="hero">
    <p class="eyebrow">{t("about.title")}</p>
    <h1>{t("about.hero")}</h1>
    <p class="lead">{t("about.lead")}</p>
  </header>

  {#if sample}
    <figure class="sample">
      {#if sample.picture}
        <a class="shot" href={sample.href} tabindex="-1" aria-hidden="true">
          <img src={sample.picture} alt="" width="1280" height="720" />
        </a>
      {/if}
      <figcaption>
        <span class="caption-label">{t("about.sample")}</span>
        <a class="caption-title" href={sample.href}>{sample.title}</a>
        <span class="caption-by">@{sample.handle}</span>
      </figcaption>
    </figure>
  {/if}

  <section aria-labelledby="about-why">
    <h2 id="about-why">{t("about.why.title")}</h2>
    <p>{t("about.why.p1")}</p>
    <p>{t("about.why.p2")}</p>
  </section>

  <section aria-labelledby="about-script">
    <h2 id="about-script">{t("about.script.title")}</h2>
    <p>{t("about.script.p")}</p>
  </section>

  <div class="specimen">
    <figure class="source" aria-labelledby="about-mine">
      <figcaption id="about-mine">{t("about.script.mine")}</figcaption>
      <pre><code><span class="md-mark">## </span>{t("about.script.heading")}

<span class="direction"><span class="md-mark">&gt; </span>{t("about.script.direction")}</span>

{t("about.script.said")}</code></pre>
    </figure>
    <figure class="result" aria-labelledby="about-theirs">
      <figcaption id="about-theirs">{t("about.script.theirs")}</figcaption>
      <div class="page">
        <p class="page-head"><span class="page-label num" aria-hidden="true">02</span><span class="page-title">{t("about.script.heading")}</span></p>
        <p class="page-text">{t("about.script.said")}</p>
      </div>
    </figure>
  </div>
  <p class="aside">{t("about.script.note")}</p>

  <section aria-labelledby="about-control">
    <h2 id="about-control">{t("about.control.title")}</h2>
    <p>{t("about.control.p1")}</p>
  </section>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col"><span class="visually-hidden">{t("visibility.label")}</span></th>
          <th scope="col">{t("about.table.who")}</th>
          <th scope="col">{t("about.table.listed")}</th>
          <th scope="col">{t("about.table.search")}</th>
        </tr>
      </thead>
      <tbody>
        {#each visibilities as visibility (visibility)}
          <tr>
            <th scope="row">{t(`visibility.${visibility}`)}</th>
            <td data-label={t("about.table.who")}>{t(`about.table.${visibility}.who`)}</td>
            <td data-label={t("about.table.listed")} class="mark" class:yes={listed[visibility] === "yes"}>{t(`about.table.listed.${listed[visibility]}`)}</td>
            <td data-label={t("about.table.search")} class="mark" class:yes={listed[visibility] === "yes"}>{t(`about.table.search.${listed[visibility]}`)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="follow">{t("about.control.p2")}</p>

  <section aria-labelledby="about-people">
    <h2 id="about-people">{t("about.people.title")}</h2>
    {#each people as person (person)}
      <h3>{t(`about.${person}.title`)}</h3>
      <p>{t(`about.${person}.p`)}</p>
    {/each}
  </section>

  <section aria-labelledby="about-not">
    <h2 id="about-not">{t("about.not.title")}</h2>
    {#each refusals as n (n)}
      <p class="refusal"><strong>{t(`about.not.${n}.title`)}</strong>{t(`about.not.${n}.body`)}</p>
    {/each}
  </section>

  <section aria-labelledby="about-start">
    <h2 id="about-start">{t("about.start.title")}</h2>
    <p>{t("about.start.p")}</p>
    <pre class="terminal" aria-label={t("about.start.commands")}><code>{#each commands as command (command)}<span class="prompt" aria-hidden="true">$ </span>{command}
{/each}</code></pre>
    <p class="small">
      {t("about.start.note")}
      <a href={docsUrl(lang, "guide/getting-started")}>{t("about.start.guide")}</a>
    </p>
  </section>

  <section aria-labelledby="about-more">
    <h2 id="about-more">{t("about.more.title")}</h2>
    <ul class="more">
      {#each more as link (link.href)}
        <li><a href={link.href}>{t(link.label)}</a></li>
      {/each}
    </ul>
  </section>

  <footer class="end">
    <p>{t("about.end")}</p>
    {#if shared.viewer?.handle}
      <Button variant="primary" size="lg" href={profilePath(shared.viewer.handle)} iconAfter="chevron-right">{t("landing.ctaProfile")}</Button>
    {:else if !shared.viewer}
      <Button variant="neutral" size="lg" icon="github" href="/signin">{t("landing.ctaSignin")}</Button>
    {/if}
  </footer>
</article>

<style>
  /* One column on the site's left edge, as the header and the landing page have it. Every block,
     figure and table included, is that column's width, so both edges of the page are one line. */
  .about {
    max-width: var(--container);
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }
  .about > :global(*) {
    max-width: var(--measure);
  }
  /* Japanese is set flush on both sides, as it is in print. */
  .about:lang(ja) p {
    text-align: justify;
    text-autospace: ideograph-alpha ideograph-numeric;
  }
  p,
  td,
  th {
    line-height: var(--leading-read-en);
  }
  :global(:lang(ja)) p,
  :global(:lang(ja)) td,
  :global(:lang(ja)) th {
    line-height: var(--leading-read-ja);
  }
  section p,
  .follow {
    margin-top: var(--space-4);
    font-size: var(--text-base);
  }
  @media (min-width: 768px) {
    section p,
    .follow {
      font-size: var(--text-article);
    }
  }
  .hero {
    padding: var(--space-16) 0 var(--space-12);
  }
  @media (min-width: 768px) {
    .hero {
      padding: var(--space-24) 0 var(--space-16);
    }
  }
  .eyebrow {
    margin-bottom: var(--space-5);
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  h1 {
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
    letter-spacing: -0.025em;
    line-height: 1.15;
  }
  @media (min-width: 768px) {
    h1 {
      font-size: var(--text-4xl);
    }
  }
  .hero .lead {
    margin-top: var(--space-6);
    color: var(--text-muted);
    font-size: var(--text-article);
  }
  h2 {
    margin-top: var(--space-20);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    line-height: 1.4;
  }
  @media (min-width: 768px) {
    h2 {
      font-size: var(--text-2xl);
    }
  }
  h3 {
    margin-top: var(--space-10);
    font-size: var(--text-lg);
  }
  h2 + h3 {
    margin-top: var(--space-6);
  }
  section h3 + p {
    margin-top: var(--space-2);
  }
  a {
    color: var(--accent);
  }

  .sample {
    margin: 0;
  }
  .shot {
    display: block;
  }
  .sample img {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .sample figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    margin-top: var(--space-3);
    font-size: var(--text-sm);
  }
  .caption-label,
  .caption-by {
    color: var(--text-muted);
  }
  .caption-title {
    color: var(--text);
    font-weight: var(--weight-semibold);
    text-decoration: none;
  }
  .caption-title:hover,
  .sample:has(.shot:hover) .caption-title {
    text-decoration: underline;
  }

  .specimen {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-8);
  }
  @media (min-width: 768px) {
    .specimen {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .specimen figure {
    display: flex;
    flex-direction: column;
    margin: 0;
  }
  .specimen figcaption {
    margin-bottom: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .source pre,
  .result .page {
    flex: 1;
    margin: 0;
    padding: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .source pre {
    background: var(--bg-subtle);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.7;
    white-space: pre-wrap;
  }
  .md-mark {
    color: var(--text-faint);
  }
  /* The one line readers never get, struck through where it is written. */
  .direction {
    color: var(--text-muted);
    text-decoration: line-through;
    text-decoration-color: var(--danger);
  }
  .result .page {
    background: var(--surface);
  }
  .page-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }
  .page-label {
    color: var(--text-faint);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .page-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }
  .page-text {
    margin-top: var(--space-3);
    font-size: var(--text-base);
  }
  .aside {
    margin-top: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .table-wrap {
    margin-top: var(--space-8);
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  @media (min-width: 768px) {
    table {
      font-size: var(--text-md);
    }
  }
  th,
  td {
    padding: var(--space-3) var(--space-4) var(--space-3) 0;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
    word-break: auto-phrase;
  }
  thead th {
    color: var(--text-muted);
    font-weight: var(--weight-medium);
  }
  tbody th {
    font-weight: var(--weight-semibold);
  }
  td {
    color: var(--text-muted);
  }
  td.mark {
    white-space: nowrap;
  }
  td.yes {
    color: var(--text);
    font-weight: var(--weight-medium);
  }
  /* On a phone each visibility is a row of its own, with each answer under its column's name. */
  @media (max-width: 599px) {
    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    tbody tr {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-1) var(--space-4);
      padding: var(--space-4) 0;
      border-bottom: 1px solid var(--border);
    }
    tbody th,
    tbody td {
      padding: 0;
      border: 0;
    }
    tbody th {
      grid-column: 1 / -1;
      margin-bottom: var(--space-1);
    }
    tbody td {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
    }
    tbody td::before {
      content: attr(data-label);
      color: var(--text-faint);
      font-weight: var(--weight-regular);
    }
  }
  .follow {
    margin-top: var(--space-6);
  }

  .refusal strong {
    display: block;
    font-weight: var(--weight-semibold);
  }

  .terminal {
    margin-top: var(--space-6);
    padding: var(--space-5);
    border-radius: var(--radius-md);
    background: var(--gray-1000);
    color: var(--gray-100);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.9;
    overflow-x: auto;
  }
  .prompt {
    opacity: 0.5;
    user-select: none;
  }
  section .small {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .more {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
    margin-top: var(--space-4);
    padding: 0;
    list-style: none;
    font-size: var(--text-base);
  }

  .end {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
    margin-top: var(--space-24);
    padding-top: var(--space-12);
    border-top: 1px solid var(--border);
  }
  .end p {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    line-height: 1.4;
  }
</style>
