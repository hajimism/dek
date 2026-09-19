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

export const DEFAULT_LANG = "ja";
export const Lang = z
  .string()
  .regex(/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/)
  .default(DEFAULT_LANG);

/** Frontmatter fields written to `.dek/schema.json` for yaml-language-server. */
export const Frontmatter = z.object({
  title: z.string(),
  event: z.string().optional(),
  date: z.string().date().optional(),
  duration: z
    .string()
    .regex(/^\d+m$/)
    .optional(),
  ratio: z.enum(["16:9", "4:3"]).default("16:9"),
  lang: Lang,
});

export type Frontmatter = z.infer<typeof Frontmatter>;

export const Deck = Frontmatter.extend({
  sections: z.array(Section).min(1),
});

export type Deck = z.infer<typeof Deck>;

export function frontmatterJsonSchema(): unknown {
  return z.toJSONSchema(Frontmatter);
}
