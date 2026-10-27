import type { Scenario } from "./scenario.ts";
import checkWithoutVoice from "./scenarios/check-without-voice.ts";
import lowContrast from "./scenarios/low-contrast.ts";
import missingImage from "./scenarios/missing-image.ts";
import mistypedDeck from "./scenarios/mistyped-deck.ts";
import overflow from "./scenarios/overflow.ts";
import refEdit from "./scenarios/ref-edit.ts";
import renamedSection from "./scenarios/renamed-section.ts";

/** Every scenario, in the order a run takes them. */
export const scenarios: Scenario[] = [
  overflow,
  missingImage,
  renamedSection,
  lowContrast,
  mistypedDeck,
  refEdit,
  checkWithoutVoice,
];
