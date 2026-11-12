// A person's public talks as RSS 2.0, newest first, with absolute links, for feed readers.

import { defineHandler } from "void";
import { env } from "void/env";
import { rssDate, xmlText as escape } from "../../src/lib/rss.ts";
import { handleOf } from "../../src/lib/profile-path.ts";
import { talkCards } from "../../src/server/pages.ts";
import { userByHandle } from "../../src/server/users.ts";

export const GET = defineHandler(async (c) => {
  const handle = handleOf(c.req.param("profile"));
  const account = handle ? await userByHandle(c, handle) : null;
  if (!account) {
    return c.text("not found", 404);
  }
  const talks = await talkCards(c, account, { publicOnly: true, limit: 50 });
  const home = `${env.APP_ORIGIN}/@${account.handle}`;
  const items = talks
    .map((talk) => {
      const link = `${home}/${talk.slug}`;
      const date = rssDate(talk.date, talk.updatedAt);
      return [
        "    <item>",
        `      <title>${escape(talk.title)}</title>`,
        `      <link>${escape(link)}</link>`,
        `      <guid isPermaLink="true">${escape(link)}</guid>`,
        ...(date ? [`      <pubDate>${date}</pubDate>`] : []),
        ...(talk.event ? [`      <category>${escape(talk.event)}</category>`] : []),
        ...(talk.picture
          ? [`      <enclosure url="${escape(env.APP_ORIGIN + talk.picture)}" type="image/png" length="0" />`]
          : []),
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(`${account.name} (@${account.handle}) · dek.pub`)}</title>
    <link>${escape(home)}</link>
    <description>${escape(`Talks by ${account.name} on dek.pub`)}</description>
    <atom:link href="${escape(`${home}/rss`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600" },
  });
});
