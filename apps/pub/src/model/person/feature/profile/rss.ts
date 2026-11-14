// A person's public talks as RSS 2.0, newest first, with absolute links, for feed readers. An item
// whose date does not parse goes without one rather than with "Invalid Date".

import { xmlText } from "../../../../common/xml.ts";
import { talkPath } from "../../../deck/deck.ts";
import type { TalkCard } from "../../../deck/type.ts";
import { profilePath } from "../../profile-path.ts";
import type { Profile } from "../../type.ts";

/** RFC 822 as RSS 2.0 wants it, from a talk's date or else when it was updated; null if neither parses. */
export function rssDate(date: string | null, fallback: string): string | null {
  for (const value of [
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date,
    fallback,
  ]) {
    if (!value) {
      continue;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toUTCString();
    }
  }
  return null;
}

/** The feed of `person`'s talks, with every link made absolute on `origin`. */
export function talkFeed(person: Profile, talks: readonly TalkCard[], origin: string): string {
  const home = `${origin}${profilePath(person.handle)}`;
  const items = talks
    .map((talk) => {
      const link = `${origin}${talkPath(person.handle, talk.slug)}`;
      const date = rssDate(talk.date, talk.updatedAt);
      return [
        "    <item>",
        `      <title>${xmlText(talk.title)}</title>`,
        `      <link>${xmlText(link)}</link>`,
        `      <guid isPermaLink="true">${xmlText(link)}</guid>`,
        ...(date ? [`      <pubDate>${date}</pubDate>`] : []),
        ...(talk.event ? [`      <category>${xmlText(talk.event)}</category>`] : []),
        ...(talk.picture
          ? [
              `      <enclosure url="${xmlText(origin + talk.picture)}" type="image/png" length="0" />`,
            ]
          : []),
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlText(`${person.name} (@${person.handle}) · dek.pub`)}</title>
    <link>${xmlText(home)}</link>
    <description>${xmlText(`Talks by ${person.name} on dek.pub`)}</description>
    <atom:link href="${xmlText(`${home}/rss`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
