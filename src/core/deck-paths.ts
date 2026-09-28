import { join } from "node:path";

/** The extensions a file under `slides/` can have: the slide, its sidecars, and its build. */
type SlideExt = ".html" | ".css" | ".ts" | ".js";

/** Where each file a deck is made of lives, named once instead of joined at every read. */
export type DeckPaths = {
  dir: string;
  script: string;
  theme: string;
  slides: string;
  assets: string;
  voice: string;
  voiceToml: string;
  voiceDict: string;
  /** `slides/<slug><ext>`. */
  slide(slug: string, ext: SlideExt): string;
};

export function deckPaths(deckDir: string): DeckPaths {
  const slides = join(deckDir, "slides");
  const voice = join(deckDir, "voice");
  return {
    dir: deckDir,
    script: join(deckDir, "script.md"),
    theme: join(deckDir, "theme.css"),
    slides,
    assets: join(deckDir, "assets"),
    voice,
    voiceToml: join(voice, "voice.toml"),
    voiceDict: join(voice, "dict.toml"),
    slide: (slug, ext) => join(slides, `${slug}${ext}`),
  };
}
