<script lang="ts">
  
  import Button from "../src/common/ui/button.svelte";
  import CopyField from "../src/common/ui/copy-field.svelte";
  import Icon from "../src/common/ui/icon.svelte";
import { talkPath } from "../src/model/deck/deck.ts";
  import TalkCard from "../src/model/deck/ui/talk-card.svelte";
  import { profilePath } from "../src/model/person/profile-path.ts";
  import { useApp } from "../src/shell/use-app.ts";
  import type { Props } from "./index.server";

  let { talks, featured }: Props = $props();
  const { shared, t } = useApp();
  const sample = $derived(featured);
</script>

<div class="landing">
  <section class="hero">
    <p class="kicker"><span class="dot" aria-hidden="true"></span>dek.pub</p>
    <h1>{t("landing.title")}</h1>
    <p class="sub lead">{t("landing.sub")}</p>
    <div class="command">
      <p class="command-label" id="cmd-label">{t("landing.command")}</p>
      <CopyField value="dekc pub publish" label={t("landing.command")} kind="command" prompt />
    </div>
    <div class="ctas">
      {#if shared.viewer?.handle}
        <Button variant="primary" size="lg" href={profilePath(shared.viewer.handle)} iconAfter="chevron-right">{t("landing.ctaProfile")}</Button>
      {:else if !shared.viewer}
        <Button variant="neutral" size="lg" icon="github" href="/signin">{t("landing.ctaSignin")}</Button>
      {/if}
      {#if sample}
        <Button variant="secondary" size="lg" href={talkPath(sample.owner.handle, sample.slug)}>{t("landing.ctaSample")}</Button>
      {/if}
    </div>
  </section>

  {#if sample?.picture}
    <a class="showcase" href={talkPath(sample.owner.handle, sample.slug)} aria-label={sample.title}>
      <span class="chrome" aria-hidden="true"><span></span><span></span><span></span></span>
      <img src={sample.picture} alt="" width="1280" height="720" />
      <span class="showcase-caption">
        <span class="showcase-title">{sample.title}</span>
        <span class="showcase-by">@{sample.owner.handle}</span>
      </span>
    </a>
  {/if}

  <section class="features" aria-label={t("landing.how")}>
    <div class="feature">
      <div class="art art-viewer" aria-hidden="true">
        <div class="mini-slide"><span class="bar w60"></span><span class="bar w40"></span></div>
        <div class="mini-controls"><Icon name="chevron-left" size={12} /><span>3 / 12</span><Icon name="chevron-right" size={12} /></div>
      </div>
      <div class="feature-text">
        <h2>{t("landing.f1.title")}</h2>
        <p>{t("landing.f1.body")}</p>
      </div>
    </div>
    <div class="feature">
      <div class="art art-article" aria-hidden="true">
        <span class="label">03</span>
        <span class="heading"></span>
        <span class="thumb"></span>
        <span class="line"></span><span class="line"></span><span class="line short"></span>
      </div>
      <div class="feature-text">
        <h2>{t("landing.f2.title")}</h2>
        <p>{t("landing.f2.body")}</p>
      </div>
    </div>
    <div class="feature">
      <pre class="art art-json" aria-hidden="true"><span class="c">$ dekc pub comments why-dek --json</span>
{"{"}"comments": [{"{"}
  "slug": <span class="s">"why-agents"</span>,
  "status": <span class="s">"open"</span>,
  "text": <span class="s">"数字の出典がほしい"</span>,
  "targets": [{"{"} "quote": <span class="s">"三倍速く"</span> {"}"}]
{"}"}]{"}"}</pre>
      <div class="feature-text">
        <h2>{t("landing.f3.title")}</h2>
        <p>{t("landing.f3.body")}</p>
      </div>
    </div>
  </section>

  <section class="recent" aria-labelledby="recent-title">
    <h2 id="recent-title">{t("landing.recent")}</h2>
    {#if talks.length === 0}
      <p class="empty">{t("landing.recentEmpty")}</p>
    {:else}
      <ul class="grid">
        {#each talks as card (card.owner.handle + card.slug)}
          <li><TalkCard {card} /></li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .landing {
    max-width: var(--container);
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }
  .hero {
    max-width: var(--measure);
    padding: var(--space-16) 0 var(--space-12);
  }
  @media (min-width: 768px) {
    .hero {
      padding-top: var(--space-24);
    }
  }
  .kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: var(--space-6);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  h1 {
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
    letter-spacing: -0.025em;
    line-height: 1.12;
  }
  @media (min-width: 768px) {
    h1 {
      font-size: var(--text-4xl);
    }
  }
  .sub {
    margin-top: var(--space-5);
    color: var(--text-muted);
    font-size: var(--text-base);
    line-height: var(--leading-read-en);
  }
  .sub:lang(ja) {
    line-height: var(--leading-read-ja);
  }
  @media (min-width: 768px) {
    .sub {
      font-size: var(--text-article);
    }
  }
  .command {
    max-width: 420px;
    margin-top: var(--space-8);
  }
  .command-label {
    margin-bottom: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }
  .showcase {
    position: relative;
    display: block;
    max-width: var(--measure-wide);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-md);
    overflow: hidden;
    text-decoration: none;
  }
  .chrome {
    display: flex;
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-subtle);
  }
  .chrome span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-hover);
  }
  .showcase img {
    width: 100%;
    height: auto;
  }
  .showcase-caption {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
    color: var(--text);
    font-size: var(--text-md);
  }
  .showcase-title {
    font-weight: var(--weight-semibold);
  }
  .showcase-by {
    color: var(--text-muted);
  }
  .features {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    max-width: var(--measure-wide);
    padding: var(--space-24) 0 var(--space-8);
  }
  .feature {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-6);
    align-items: center;
  }
  @media (min-width: 768px) {
    .feature {
      grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
      gap: var(--space-12);
    }
  }
  .feature h2 {
    font-size: var(--text-lg);
  }
  .feature p {
    margin-top: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-base);
    line-height: var(--leading-read-en);
  }
  .feature p:lang(ja),
  :global(:lang(ja)) .feature p {
    line-height: var(--leading-read-ja);
  }
  .art {
    position: relative;
    aspect-ratio: 16 / 10;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    overflow: hidden;
  }
  .art-viewer {
    display: flex;
    flex-direction: column;
    padding: var(--space-4);
    gap: var(--space-3);
  }
  .mini-slide {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 0 12%;
    border-radius: 6px;
    background: var(--gray-1000);
  }
  .bar {
    height: 10px;
    border-radius: 3px;
    background: var(--bg);
  }
  .w60 {
    width: 60%;
    height: 14px;
  }
  .w40 {
    width: 40%;
    opacity: 0.5;
  }
  .mini-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  .art-article {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: var(--space-5) 18%;
  }
  .art-article .label {
    color: var(--text-faint);
    font-size: 10px;
    font-weight: var(--weight-medium);
  }
  .art-article .heading {
    width: 70%;
    height: 10px;
    border-radius: 3px;
    background: var(--text);
  }
  .art-article .thumb {
    height: 38%;
    margin: 4px 0;
    border-radius: 4px;
    background: var(--bg-active);
  }
  .art-article .line {
    height: 6px;
    border-radius: 3px;
    background: var(--border-hover);
  }
  .art-article .line:nth-of-type(2) {
    background: linear-gradient(90deg, var(--border-hover) 30%, var(--highlight) 30% 62%, var(--border-hover) 62%);
  }
  .art-article .short {
    width: 55%;
  }
  .art-json {
    aspect-ratio: auto;
    padding: var(--space-4);
    background: var(--bg-subtle);
    color: var(--text);
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre;
    overflow: hidden;
  }
  .art-json .c {
    color: var(--text-faint);
  }
  .art-json .s {
    color: var(--accent);
  }
  .recent {
    padding-top: var(--space-16);
  }
  .recent h2 {
    margin-bottom: var(--space-6);
    font-size: var(--text-xl);
  }
  .empty {
    color: var(--text-muted);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8) var(--space-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @media (min-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (min-width: 1024px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
