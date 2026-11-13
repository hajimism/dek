// Mailing the people in a thread when something happens in it, as notice.ts picks them. Each is
// checked with their own grants, so a mail never tells anyone of a thread they could not open.

import { replies } from "@schema";
import type { Context } from "hono";
import { db, eq } from "void/db";
import { threadLabel } from "../../../../../src/pub/thread.ts";
import { sendMail } from "../../common/mail.server.ts";
import { grantedSide, grantsOf, roleOf } from "../deck/grant/store.server.ts";
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
  actor: { person: Person | null; guestName?: string },
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
    actorId: actor.person?.id ?? null,
  });
  if (ids.length === 0) {
    return;
  }
  const [people, muted, url] = await Promise.all([
    peopleById(c, ids),
    mutedAmong(deck.id, ids),
    talkUrl(c, deck),
  ]);
  const name = actor.person
    ? actor.person.name || actor.person.handle
    : (actor.guestName ?? "A guest");
  for (const id of ids) {
    const person = people.get(id);
    if (!person) {
      continue;
    }
    const held = await grantsOf(deck.id, person);
    const may = mayBeNoticed(deck, thread, person, {
      role: roleOf(held),
      side: grantedSide(held),
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
