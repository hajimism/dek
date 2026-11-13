// A comment is a thread on one slide of one version, with the replies under it. Its row is the
// protocol's CommentRow; the page adds what it shows while one is being written or sent.

import type { threads } from "@schema";
import { z } from "zod";
import {
  type CommentAnchor,
  type CommentRow,
  CommentTarget,
} from "../../../../../src/pub/protocol.ts";

export type ThreadRow = typeof threads.$inferSelect;

/** What a thread points at, as its `targets` column holds it. */
export const CommentTargets = z.array(CommentTarget);

export type Filter = "open" | "resolved" | "all";

/** A row from the API, or one being sent: shown at once, faded until the server has it. */
export type CardComment = CommentRow & { pending?: boolean; failed?: boolean };

export type ReplyInput = { text: string; guestName?: string; turnstile?: string };

/** A comment being written: what it will point at. */
export type Draft = { anchor: CommentAnchor; slideNumber: number | null };
