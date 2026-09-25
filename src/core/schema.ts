import { z } from "zod";

/** Section / beat ids. Digits-only values collide with numeric `data-step`. */
export const Id = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .refine((s) => /[a-z]/.test(s));

export type Id = z.infer<typeof Id>;

export const Beat = z.object({
  id: Id.optional(),
  title: z.string(),
  body: z.string(),
  line: z.number(),
});

export type Beat = z.infer<typeof Beat>;

export const Section = z.object({
  slug: Id,
  title: z.string(),
  body: z.string(),
  beats: z.array(Beat),
  line: z.number(),
});

export type Section = z.infer<typeof Section>;

export const Lang = z
  .string()
  .regex(/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/, "write a BCP 47 tag, like en or ja");

/** The page language when there is no script to read it from, such as the project index. */
export const FALLBACK_LANG = "en";

/**
 * The language a script is written in, read from its writing system: kana means Japanese even
 * among kanji, then Hangul, then Han. Anything else is taken as English. The frontmatter `lang`
 * overrides it for every other language.
 */
export function inferLang(text: string): string {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
    return "ja";
  }
  if (/\p{Script=Hangul}/u.test(text)) {
    return "ko";
  }
  if (/\p{Script=Han}/u.test(text)) {
    return "zh";
  }
  return "en";
}

/** Frontmatter fields written to `.dek/schema.json` for yaml-language-server. */
export const Frontmatter = z.object({
  title: z.string(),
  description: z
    .string()
    .optional()
    .describe("One or two sentences a shared link shows under the title."),
  event: z.string().optional(),
  date: z.string().date("write a date, like 2026-04-18").optional(),
  duration: z
    .string("write minutes, like 10m")
    .regex(/^\d+m$/, "write minutes, like 10m")
    .optional(),
  ratio: z.enum(["16:9", "4:3"]).default("16:9"),
  lang: Lang.optional().describe(
    "BCP 47 tag for the page. Omit it to follow the script: kana → ja, Hangul → ko, Han → zh, else en.",
  ),
});

export type Frontmatter = z.infer<typeof Frontmatter>;

export const Deck = Frontmatter.extend({
  lang: Lang,
  sections: z.array(Section).min(1, "add a ## heading; each one becomes a slide"),
});

export type Deck = z.infer<typeof Deck>;

/**
 * What a script may write, not what parsing returns: a field with a default is optional. Unknown
 * keys stay flagged, as DEK008 flags them, although parsing drops them rather than failing.
 */
export function frontmatterJsonSchema(): unknown {
  return { ...z.toJSONSchema(Frontmatter, { io: "input" }), additionalProperties: false };
}
