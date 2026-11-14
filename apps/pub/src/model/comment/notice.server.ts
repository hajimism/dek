// Mailing the people in a thread when something happens in it, as notice.ts picks them. Each is
// checked with their own grants, so a mail never tells anyone of a thread they could not open.

import { replies } from "@schema";
import type { Context } from "hono";
import { db, eq } from "void/db";
import { threadLabel } from "../../../../../src/pub/thread.ts";
import { sendMail } from "../../common/mail.server.ts";
import { grantsOf } from "../deck/grant/store.server.ts";
import { talkUrl } from "../deck/store.server.ts";
import type { Deck } from "../deck/type.ts";
import { peopleById } from "../person/store.server.ts";
import type { Person } from "../person/type.ts";
import { mutedAmong } from "./mute.server.ts";
import { mayBeNoticed, type NoticeEvent, noticeMail, noticeRecipients } from "./notice.ts";
import type { ThreadRow } from "./type.ts";

export async function sendNotices(
  c: Context,
  deck: Deck,
  thread: ThreadRow,
  event: NoticeEvent,
  actor: Person,
  text: string,
): Promise<void> {
  const repliers = await db
    .select({ authorId: replies.authorId })
    .from(replies)
    .where(eq(replies.threadId, thread.id))
    .all();
  const ids = noticeRecipients({
    ownerId: deck.ownerId,
    authorId: thread.authorId,
    replierIds: repliers.map((row) => row.authorId),
    actorId: actor.id,
  });
  if (ids.length === 0) {
    return;
  }
  const [people, muted, url] = await Promise.all([
    peopleById(c, ids),
    mutedAmong(deck.id, ids),
    talkUrl(c, deck),
  ]);
  const name = actor.name || actor.handle;
  for (const id of ids) {
    const person = people.get(id);
    if (!person) {
      continue;
    }
    const may = mayBeNoticed(deck, thread, person, {
      grants: await grantsOf(deck.id, person),
      muted: muted.has(id),
    });
    if (may) {
      await sendMail(
        noticeMail({
          to: person.email,
          event,
          title: deck.title,
          label: threadLabel(thread),
          actor: name,
          text,
          url: `${url}#${thread.id}`,
        }),
      );
    }
  }
}
