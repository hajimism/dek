import { defineConfig, type DefaultTheme } from "vitepress";

const site = "https://hajimism.github.io/dek/";
const repo = "https://github.com/hajimism/dek";

function guide(p: string, t: Record<string, string>): DefaultTheme.SidebarItem[] {
  return [
    {
      text: t.start,
      items: [
        { text: t.why, link: `${p}/guide/why` },
        { text: t.gettingStarted, link: `${p}/guide/getting-started` },
        { text: t.tutorial, link: `${p}/guide/tutorial` },
      ],
    },
    {
      text: t.concepts,
      items: [
        { text: t.structure, link: `${p}/guide/structure` },
        { text: t.script, link: `${p}/guide/script` },
        { text: t.slides, link: `${p}/guide/slides` },
        { text: t.steps, link: `${p}/guide/steps` },
        { text: t.theme, link: `${p}/guide/theme` },
        { text: t.lint, link: `${p}/guide/lint` },
      ],
    },
    {
      text: t.workflows,
      items: [
        { text: t.present, link: `${p}/guide/present` },
        { text: t.voice, link: `${p}/guide/voice` },
        { text: t.ai, link: `${p}/guide/ai` },
      ],
    },
    {
      text: t.more,
      items: [
        { text: t.faq, link: `${p}/guide/faq` },
        { text: t.architecture, link: `${p}/guide/architecture` },
        { text: t.agentCriteria, link: `${p}/guide/agent-criteria` },
      ],
    },
  ];
}

function reference(p: string, t: Record<string, string>): DefaultTheme.SidebarItem[] {
  return [
    {
      text: t.reference,
      items: [
        { text: t.cli, link: `${p}/reference/cli` },
        { text: t.lintRules, link: `${p}/reference/lint` },
        { text: t.config, link: `${p}/reference/config` },
      ],
    },
  ];
}

const en = {
  start: "Start",
  why: "Why dek",
  gettingStarted: "Getting Started",
  tutorial: "Tutorial",
  concepts: "Concepts",
  structure: "Projects and Decks",
  script: "The Script",
  slides: "Slides",
  steps: "Beats",
  theme: "Themes",
  lint: "Lint",
  workflows: "Workflows",
  present: "Presenting",
  voice: "Voice and Video",
  ai: "Working with AI Agents",
  more: "More",
  faq: "FAQ",
  architecture: "Architecture",
  agentCriteria: "Agent Usability Criteria",
  reference: "Reference",
  cli: "CLI",
  lintRules: "Lint Rules",
  config: "Configuration",
};

const ja = {
  start: "はじめに",
  why: "dek の設計思想",
  gettingStarted: "はじめる",
  tutorial: "チュートリアル",
  concepts: "コンセプト",
  structure: "プロジェクトとデッキ",
  script: "台本",
  slides: "スライド",
  steps: "ビート",
  theme: "テーマ",
  lint: "Lint",
  workflows: "ワークフロー",
  present: "発表する",
  voice: "声と動画",
  ai: "AI エージェントと作る",
  more: "その他",
  faq: "FAQ",
  architecture: "アーキテクチャ",
  agentCriteria: "エージェント向けの品質基準",
  reference: "リファレンス",
  cli: "CLI",
  lintRules: "Lint ルール",
  config: "設定",
};

export default defineConfig({
  title: "dek",
  base: "/dek/",
  srcDir: ".",
  lastUpdated: true,
  cleanUrls: false,
  sitemap: { hostname: site },
  head: [
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "dek" }],
    ["meta", { property: "og:url", content: site }],
    ["meta", { name: "twitter:card", content: "summary" }],
    ["meta", { name: "twitter:title", content: "dek" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      description: "Talk-script-first HTML slides. Write what you will say; the slides follow.",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/guide/why", activeMatch: "/guide/" },
          { text: "Reference", link: "/reference/cli", activeMatch: "/reference/" },
        ],
        sidebar: {
          "/guide/": guide("", en),
          "/reference/": reference("", en),
        },
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: "Edit this page on GitHub",
        },
        footer: {
          message: "Released under the MIT License.",
          copyright: `Copyright © <a href="${repo}">dek</a>`,
        },
      },
    },
    ja: {
      label: "日本語",
      lang: "ja",
      description: "台本から組み立てる HTML スライド。喋ることを書けば、スライドはそこから生える。",
      themeConfig: {
        nav: [
          { text: "ガイド", link: "/ja/guide/why", activeMatch: "/ja/guide/" },
          { text: "リファレンス", link: "/ja/reference/cli", activeMatch: "/ja/reference/" },
        ],
        sidebar: {
          "/ja/guide/": guide("/ja", ja),
          "/ja/reference/": reference("/ja", ja),
        },
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: "GitHub でこのページを編集",
        },
        outline: { label: "目次", level: [2, 3] },
        lastUpdated: { text: "最終更新" },
        docFooter: { prev: "前へ", next: "次へ" },
        returnToTopLabel: "トップへ戻る",
        sidebarMenuLabel: "メニュー",
        darkModeSwitchLabel: "テーマ",
        langMenuLabel: "言語",
        footer: {
          message: "MIT License",
          copyright: `Copyright © <a href="${repo}">dek</a>`,
        },
      },
    },
  },
  themeConfig: {
    siteTitle: "dek",
    socialLinks: [{ icon: "github", link: repo }],
    outline: { level: [2, 3] },
    search: {
      provider: "local",
      options: {
        locales: {
          ja: {
            translations: {
              button: { buttonText: "検索", buttonAriaLabel: "検索" },
              modal: {
                displayDetails: "詳細を表示",
                resetButtonTitle: "リセット",
                backButtonTitle: "戻る",
                noResultsText: "見つかりませんでした",
                footer: { selectText: "選択", navigateText: "移動", closeText: "閉じる" },
              },
            },
          },
        },
      },
    },
  },
});
