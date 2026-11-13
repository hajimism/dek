// A deck's comments in the browser. A comment written here shows at once, faded until the server
// has it; one that fails to send stays, marked, to be sent again.

import type { CommentRow, CommentTarget, NewComment } from "../../../../../src/pub/protocol.ts";
import { api } from "../../common/ui/api.ts";
import type { CardComment, ReplyInput } from "./type.ts";

export class CommentList {
  rows: CardComment[] = $state([]);
  readonly #path: string;
  readonly #unsent = new Map<string, NewComment>();
  readonly #failed: (error: unknown) => void;
  #count = 0;

  /** `failed` is told of each call the server refused or that did not reach it. */
  constructor(deckId: string, rows: readonly CommentRow[], failed: (error: unknown) => void) {
    this.#path = `/api/decks/${deckId}/comments`;
    this.rows = [...rows];
    this.#failed = failed;
  }

  #replace(row: CardComment, oldId = row.id): void {
    const at = this.rows.findIndex((comment) => comment.id === oldId);
    if (at === -1) {
      this.rows.push(row);
    } else {
      this.rows[at] = row;
    }
  }

  async #send(id: string, body: NewComment): Promise<CommentRow | null> {
    try {
      const row = await api<CommentRow>(this.#path, { method: "POST", body });
      this.#unsent.delete(id);
      this.#replace(row, id);
      return row;
    } catch (error) {
      const at = this.rows.findIndex((comment) => comment.id === id);
      const card = this.rows[at];
      if (card) {
        this.rows[at] = { ...card, pending: false, failed: true };
      }
      this.#failed(error);
      return null;
    }
  }

  /** Open a thread; the row the server made, or null when it did not take it. */
  async create(body: NewComment, author: CommentRow["author"]): Promise<CommentRow | null> {
    const id = `tmp_${++this.#count}`;
    // The server numbers each scope on its own and decides one left out; this is a guess till then.
    const scope = body.scope ?? "shared";
    const highest = this.rows
      .filter((comment) => comment.scope === scope)
      .reduce((max, comment) => Math.max(max, comment.number), 0);
    this.rows.push({
      number: highest + 1,
      id,
      scope,
      slug: body.anchor.slug,
      step: body.anchor.step,
      status: "open",
      text: body.text,
      targets: body.anchor.targets as CommentTarget[],
      author,
      version: body.version ?? 0,
      url: "",
      thread: [],
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      pending: true,
    });
    this.#unsent.set(id, body);
    return this.#send(id, body);
  }

  /** Send again a comment that did not get through. */
  async retry(comment: CardComment): Promise<CommentRow | null> {
    const body = this.#unsent.get(comment.id);
    if (!body) {
      return null;
    }
    this.#replace({ ...comment, pending: true, failed: false }, comment.id);
    return this.#send(comment.id, body);
  }

  async reply(comment: CardComment, input: ReplyInput): Promise<boolean> {
    try {
      // The API answers with the reply alone; it joins the end of its thread.
      const answer = await api<CommentRow["thread"][number]>(
        `${this.#path}/${comment.id}/replies`,
        { method: "POST", body: input },
      );
      const current = this.rows.find((candidate) => candidate.id === comment.id) ?? comment;
      this.#replace({ ...current, thread: [...current.thread, answer] });
      return true;
    } catch (error) {
      this.#failed(error);
      return false;
    }
  }

  /** Share a team thread with the client; it comes back under its shared number. */
  async widen(comment: CardComment): Promise<boolean> {
    try {
      this.#replace(await api<CommentRow>(`${this.#path}/${comment.id}/widen`, { method: "POST" }));
      return true;
    } catch (error) {
      this.#failed(error);
      return false;
    }
  }

  async setResolved(comment: CardComment, resolved: boolean): Promise<void> {
    try {
      this.#replace(
        await api<CommentRow>(`${this.#path}/${comment.id}/${resolved ? "resolve" : "reopen"}`, {
          method: "POST",
        }),
      );
    } catch (error) {
      this.#failed(error);
    }
  }
}
