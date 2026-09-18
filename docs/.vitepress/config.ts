import { defineConfig } from "vitepress";

const site = "https://hajimism.github.io/dek/";
const title = "dek";
const description = "台本から組み立てる HTML スライド。Talk-script-first HTML slides.";

const guideSidebar = [
  { text: "なぜ dek か", link: "/guide/why" },
  { text: "はじめる", link: "/guide/getting-started" },
  { text: "プロジェクト構造", link: "/guide/structure" },
  { text: "台本", link: "/guide/script" },
  { text: "スライド", link: "/guide/slides" },
  { text: "ビート", link: "/guide/steps" },
  { text: "テーマ", link: "/guide/theme" },
  { text: "Lint", link: "/guide/lint" },
  { text: "発表", link: "/guide/present" },
  { text: "声と動画", link: "/guide/voice" },
  { text: "AI と作る", link: "/guide/ai" },
  { text: "FAQ", link: "/guide/faq" },
  { text: "アーキテクチャ", link: "/guide/architecture" },
];

const referenceSidebar = [
  { text: "CLI", link: "/reference/cli" },
  { text: "Lint ルール", link: "/reference/lint" },
  { text: "設定", link: "/reference/config" },
];

export default defineConfig({
  lang: "ja",
  title,
  description,
  base: "/dek/",
  srcDir: ".",
  lastUpdated: true,
  sitemap: {
    hostname: site,
  },
  head: [
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: title }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:url", content: site }],
    ["meta", { name: "twitter:card", content: "summary" }],
    ["meta", { name: "twitter:title", content: title }],
    ["meta", { name: "twitter:description", content: description }],
  ],
  themeConfig: {
    siteTitle: "dek",
    nav: [
      { text: "ガイド", link: "/guide/why", activeMatch: "/guide/" },
      { text: "リファレンス", link: "/reference/cli", activeMatch: "/reference/" },
      { text: "GitHub", link: "https://github.com/hajimism/dek" },
    ],
    sidebar: {
      "/guide/": [{ text: "ガイド", items: guideSidebar }],
      "/reference/": [{ text: "リファレンス", items: referenceSidebar }],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/hajimism/dek" }],
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "検索",
            buttonAriaLabel: "検索",
          },
          modal: {
            displayDetails: "詳細を表示",
            resetButtonTitle: "リセット",
            backButtonTitle: "戻る",
            noResultsText: "見つかりませんでした",
            footer: {
              selectText: "選択",
              navigateText: "移動",
              closeText: "閉じる",
            },
          },
        },
      },
    },
    editLink: {
      pattern: "https://github.com/hajimism/dek/edit/main/docs/:path",
      text: "このページを編集",
    },
    lastUpdated: {
      text: "最終更新",
    },
    outline: {
      label: "目次",
      level: [2, 3],
    },
    docFooter: {
      prev: "前へ",
      next: "次へ",
    },
    footer: {
      message: "MIT License",
      copyright: 'Copyright © <a href="https://github.com/hajimism/dek">dek</a>',
    },
  },
});
