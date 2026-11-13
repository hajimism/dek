# 54. Mail the people in a dek.pub thread, and let each mute a deck

Date: 2026-11-13

## Status

Accepted

## Context

In a review, a comment matters to someone who is not on the page when it is written: the owner learns of the client's question, and the client learns of the answer. dek.pub can send mail now (ADR 53).

What shapes the notices:

- **A thread can be kept from some readers.** A team thread is not to reach the client's side at all (ADR 51), and a thread on a version not yet current is the owner's (`canSeeThread`). A mail that names a thread tells its reader that the thread exists.
- **Access changes after someone writes.** A grant can be removed, narrowed to `view`, or moved to the client's side after its holder replied.
- **Guests write without an account,** and so without an address.
- **Most mail is unwanted mail.** Someone who reads a deck's threads but wrote none of them did not ask to hear of each one.

## Decision

**A new thread, a reply and a resolve are mailed to the people in the thread:** the deck's owner, the thread's author, and everyone who replied, each once, and never the one who did what the mail is about. A reopen, a share with the client (`widen`) and an edit are not mailed. Guests get no mail.

**Each of them is checked with their own grants when the mail is sent.** `mayBeNoticed` in `src/model/comment/notice.ts` asks the same questions a request would: that they may still open the deck, read its comments, and see this thread on their side and its version. Anyone it says no to is mailed nothing.

**A mail says who did what on which thread, quotes the words on one line, and links to the thread** on the talk page (`#<thread id>`, which opens the panel there). The thread is named by the label the reader's cards show, `3` or `T3`. Each mail goes out on its own, as the event happens.

**Anyone who reads a deck's comments can mute its mail.** A row in `mutes` (account, deck) stops every notice about the deck to that account; it does not stop invitations or sign-in links. `PUT /api/decks/:id/mute` mutes, `DELETE` unmutes, and `GET` reads it, as protocol `MuteState`; anyone who may not read the comments gets 404. On the talk page, a bell beside the comments' title turns it off and on.

**What was not chosen:**

- **Mailing everyone who may read the thread.** On a deck shared with a whole team, every comment would reach everyone, and they would mute it.
- **Choosing whom to mail when the thread is written,** by the writer's side. The readers' access can change by the time of a later reply, and each reader's own check is the one that cannot leak.
- **A digest of what happened**, once a day or an hour. It needs a cron job and a record of what was sent, and is left for later.
- **Muting a single thread.** A deck is what a review is about; one switch per deck is enough until someone asks for less.

## Consequences

- The schema gains `mutes`, with its migration.
- Each notice reads the thread's replies, the recipients' accounts and their grants: a few D1 reads per recipient, after the answer has gone.
- Drafts that only the team sees will need nothing more here: the version clause of `canSeeThread` already keeps a thread on a version not yet current from the client's side.
- `MuteState` is added to the protocol; no `--json` of `dekc` changes.
- The e2e round trip checks that the owner is mailed of a new thread and of a resolve, that the author is mailed of a reply, and that nothing comes while the deck is muted.
