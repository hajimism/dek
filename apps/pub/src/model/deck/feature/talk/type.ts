// The talk page: the deck in its frame, the script beside it, and the comments on both; and what
// the page and the deck say to each other.

import type {
  CommentPolicy,
  CommentRow,
  LikeState,
  PublicComment,
  Visibility,
} from "../../../../../../../src/pub/protocol.ts";
import type { Quote } from "../../../comment/quote.ts";
import type { Profile } from "../../../person/type.ts";
import type { GrantSide } from "../../grant/type.ts";
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
  /** The talk's length in minutes, from its frontmatter. */
  minutes: number | null;
  lang: string | null;
  visibility: Visibility;
  scriptPublic: boolean;
  commentPolicy: CommentPolicy;
  /** Where the talk is shared from: a `link` one's URL carries its key. */
  url: string;
  /**
   * The talk's URL with no key, for search engines and link previews to name it by, and for the
   * links to review threads, whose readers open the talk by their grant.
   */
  canonical: string;
  /**
   * The key a `link` talk opens by, which the page's own requests for its pictures, likes and
   * public comments carry; null on any other talk.
   */
  key: string | null;
  owner: Profile;
  /** The version the page shows: the current one. */
  version: number;
  viewer: { src: string; origin: string };
  slides: ArticleSlide[];
  script: "public" | "owner" | "hidden";
  isOwner: boolean;
  /** What the comments API would answer this person; null when it would not. */
  comments: CommentRow[] | null;
  canComment: boolean;
  /** Whether the signed-in reader of the comments has muted their mail; null for anyone else. */
  muted: boolean | null;
  /** The public comments at the bottom of the page; null on a talk not open to anyone, which has none. */
  publicComments: PublicComment[] | null;
  /** Whether the deck's comment policy lets this reader post one. */
  canPostPublic: boolean;
  /** The talk's likes; null on a talk not open to anyone. `liked` is false for a reader not signed in. */
  likes: LikeState | null;
  /** The side of the work the reader is on; the team's may open a thread for the team alone. */
  side: GrantSide;
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
  | { type: "dek:mark"; id: string }
  | { type: "dek:key"; key: "c" };

/** A numbered mark the deck draws over an element a comment points at. */
export type Mark = { id: string; number: number; slug: string; step: string; box: Box };

export type PageMessage =
  | { type: "dek:goto"; slug: string; step?: string }
  | { type: "dek:current" }
  | { type: "dek:pick"; on: boolean }
  | { type: "dek:marks"; marks: Mark[] };
