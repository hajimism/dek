// The talk page: the deck in its frame, the script beside it, and the comments on both; and what
// the page and the deck say to each other.

import type {
  CommentPolicy,
  CommentRow,
  Visibility,
} from "../../../../../../../src/pub/protocol.ts";
import type { Quote } from "../../../comment/quote.ts";
import type { Profile } from "../../../person/type.ts";
import type { TalkCard } from "../../type.ts";

export type ArticleSlide = {
  slug: string;
  title: string;
  steps: string[];
  /** Null when the reader may not see the script. */
  paragraphs: string[] | null;
  picture: string | null;
};

export type Talk = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  event: string | null;
  date: string | null;
  lang: string | null;
  visibility: Visibility;
  scriptPublic: boolean;
  commentPolicy: CommentPolicy;
  url: string;
  owner: Profile;
  version: number;
  viewer: { src: string; origin: string };
  slides: ArticleSlide[];
  script: "public" | "owner" | "hidden";
  isOwner: boolean;
  /** What the comments API would answer this person; null when it would not. */
  comments: CommentRow[] | null;
  canComment: boolean;
  /** The picture link previews show, as an absolute URL. */
  image: string | null;
  more: TalkCard[];
};

/** Text chosen in the article to comment on. */
export type QuoteSelection = { slug: string; quote: Quote };

// What the page and the deck in its frame say to each other with postMessage
// (docs/reference/embed.md). These run in the browser, so embed.ts reads them by hand rather than
// through a schema library the page would have to download.

export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export type Position = { slug: string; step: string; index: number };

export type ReadySlide = { slug: string; steps: string[] };

export type PickedElement = {
  kind: "element";
  path: string;
  name: string;
  text: string;
  box: Box;
};

export type DeckMessage =
  | {
      type: "dek:ready";
      protocol: number;
      deck: string;
      size: Size;
      slides: ReadySlide[];
      current: Position;
    }
  | ({ type: "dek:moved" } & Position)
  | { type: "dek:picked"; slug: string; step: string; target: PickedElement }
  | { type: "dek:pick-cancel" }
  | { type: "dek:mark"; id: string };

/** A numbered mark the deck draws over an element a comment points at. */
export type Mark = { id: string; number: number; slug: string; step: string; box: Box };

export type PageMessage =
  | { type: "dek:goto"; slug: string; step?: string }
  | { type: "dek:current" }
  | { type: "dek:pick"; on: boolean }
  | { type: "dek:marks"; marks: Mark[] };
