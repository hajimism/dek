// Who hears by mail of a new thread, a reply or a resolve, and what the mail says. A thread's
// notices go to the people in it: the deck's owner, its author and those who replied, each only
// while they may read it on their own side, and never to whoever did what the mail is about.

import { excerpt, type Mail } from "../../common/mail.ts";
import { canView, type DeckRules, sideOf } from "../deck/access.ts";
import type { GrantRole, GrantSide } from "../deck/grant/type.ts";
import type { Person } from "../person/type.ts";
import { canReadComments, canSeeThread } from "./access.ts";
import type { ThreadRow } from "./type.ts";

export type NoticeEvent = "thread" | "reply" | "resolve";

/** The accounts in a thread, once each, the owner first; guests have none and get no mail. */
export function noticeRecipients(thread: {
  ownerId: string;
  authorId: string | null;
  replierIds: readonly (string | null)[];
  actorId: string | null;
}): string[] {
  const ids = new Set([thread.ownerId, thread.authorId, ...thread.replierIds]);
  ids.delete(thread.actorId);
  ids.delete(null);
  return [...ids].filter((id): id is string => id !== null);
}

/** Whether one of them hears of it: they still see the deck and the thread, and did not mute it. */
export function mayBeNoticed(
  deck: DeckRules & { currentVersion: number | null },
  thread: Pick<ThreadRow, "n" | "scope">,
  person: Pick<Person, "id">,
  held: { role: GrantRole | null; side: GrantSide | null; muted: boolean },
): boolean {
  return (
    !held.muted &&
    canView(deck, person, held.role) &&
    canReadComments(deck, person, held.role) &&
    canSeeThread(deck, thread, person, sideOf(deck, person, held.side))
  );
}

export function noticeMail(notice: {
  to: string;
  event: NoticeEvent;
  title: string;
  /** The thread's label, as the reader's cards show it: `3`, or `T3`. */
  label: string;
  actor: string;
  text: string;
  url: string;
}): Mail {
  const { title, label, actor } = notice;
  const subject =
    notice.event === "thread"
      ? `${actor} commented on “${title}” (#${label})`
      : notice.event === "reply"
        ? `${actor} replied on “${title}” (#${label})`
        : `${actor} resolved #${label} on “${title}”`;
  const said = notice.text ? excerpt(notice.text) : "";
  return {
    to: notice.to,
    subject,
    text: [
      ...(said ? [said, "", `— ${actor}`, ""] : []),
      notice.url,
      "",
      "You get this as the talk's owner or as someone in this thread. The bell beside the talk's comments stops this mail.",
      "",
    ].join("\n"),
  };
}
