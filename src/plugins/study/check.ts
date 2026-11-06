import type { CheckInput } from "../../plugin-api.ts";
import { type RuleId, STUDY_FILE } from "./manifest.ts";
import { follows, normalize, occurrences, placeStickers } from "./place.ts";
import { readStudy, type Sticker } from "./study.ts";
import { slideText } from "./text.ts";

/** A finding, which can name only a rule the manifest declares. Paths are relative to the deck. */
export type Finding = { rule: RuleId; message: string; path: string; line: number; hint: string };

/** Reads a file of the deck by its path relative to the deck's folder; undefined when absent. */
export type ReadFile = (path: string) => Promise<string | undefined>;

/**
 * Checks the deck's stickers against its slides: each sticker's words are on its slide (STUDY001),
 * no other place on the slide shows them unhidden (STUDY002), and study.yaml reads (STUDY003). A
 * deck with no study.yaml has nothing to check.
 */
export async function check(input: CheckInput, read: ReadFile): Promise<Finding[]> {
  const source = await read(STUDY_FILE);
  if (source === undefined) {
    return [];
  }
  const { stickers, problems } = readStudy(source);
  const findings: Finding[] = problems.map((problem) => ({
    rule: "STUDY003",
    message: problem.message,
    path: STUDY_FILE,
    line: problem.line,
    hint: "write study.yaml as https://hajimism.github.io/dek/reference/plugins.html#dek-study shows",
  }));

  const texts = new Map<string, string>();
  const htmlPaths = new Map<string, string>();
  for (const slide of input.deck.slides) {
    const html = slide.html === null ? undefined : await read(slide.html);
    texts.set(slide.slug, html === undefined ? "" : await slideText(html));
    htmlPaths.set(slide.slug, slide.html ?? `slides/${slide.slug}.html`);
  }

  /** The one other slide the sticker would find its place on, prefix and all, if exactly one. */
  const elsewhere = (sticker: Sticker): string | undefined => {
    const found = [...texts].filter(
      ([slug, text]) => slug !== sticker.slide && placeStickers(text, [sticker]).lost.length === 0,
    );
    return found.length === 1 ? found[0]?.[0] : undefined;
  };
  const lost = (sticker: Sticker, message: string, fallback: string): Finding => {
    const other = elsewhere(sticker);
    return {
      rule: "STUDY001",
      message,
      path: STUDY_FILE,
      line: sticker.line,
      hint:
        other === undefined
          ? fallback
          : `the words are on slide ${other}: set the sticker's \`slide: ${other}\``,
    };
  };

  /**
   * Why a sticker on a slide that is there found no place: its words are gone, no place of them
   * follows its prefix, or the stickers before it took every place. Only gone words are looked
   * for on other slides; words still on the slide are the sticker's to find there.
   */
  const lostOnSlide = (sticker: Sticker, slug: string, text: string, path: string): Finding => {
    const quote = normalize(sticker.quote);
    const places = occurrences(text, quote);
    if (places.length === 0) {
      return lost(
        sticker,
        `sticker ${sticker.id}: 「${sticker.quote}」 is not on slide ${slug}`,
        `find where the words went in ${path} and set the sticker's quote and prefix to them, or delete the sticker`,
      );
    }
    const prefix = sticker.prefix === undefined ? undefined : normalize(sticker.prefix);
    if (prefix !== undefined && !places.some((place) => follows(text, place, prefix))) {
      return {
        rule: "STUDY001",
        message: `sticker ${sticker.id}: 「${sticker.quote}」 is on slide ${slug}, but not after 「${sticker.prefix}」`,
        path: STUDY_FILE,
        line: sticker.line,
        hint: `set the sticker's prefix to the words right before 「${sticker.quote}」 in ${path}, or leave the prefix out`,
      };
    }
    return {
      rule: "STUDY001",
      message: `sticker ${sticker.id}: every 「${sticker.quote}」 on slide ${slug} has a sticker before this one`,
      path: STUDY_FILE,
      line: sticker.line,
      hint: "delete the sticker, since another already hides these words",
    };
  };

  const bySlide = Map.groupBy(stickers, (sticker) => sticker.slide);
  for (const [slug, onSlide] of bySlide) {
    const text = texts.get(slug);
    if (text === undefined) {
      for (const sticker of onSlide) {
        findings.push(
          lost(
            sticker,
            `sticker ${sticker.id}: slide ${slug} is not in this deck`,
            "set the sticker's `slide` to the slide its words are on, or delete the sticker",
          ),
        );
      }
      continue;
    }
    const placement = placeStickers(text, onSlide);
    for (const sticker of placement.lost) {
      findings.push(lostOnSlide(sticker, slug, text, htmlPaths.get(slug) ?? ""));
    }
    for (const { first, count } of placement.shown) {
      findings.push({
        rule: "STUDY002",
        message: `「${first.quote}」 is hidden by sticker ${first.id} but shows ${count} more ${count === 1 ? "time" : "times"} on slide ${slug}`,
        path: STUDY_FILE,
        line: first.line,
        hint: `add a sticker for each other 「${first.quote}」 on the slide, with a prefix that tells it apart, or reword the others`,
      });
    }
  }
  // The same deck gives the same output, in the same order.
  return findings.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule),
  );
}
