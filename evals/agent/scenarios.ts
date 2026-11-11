import type { Scenario } from "./scenario.ts";
import checkWithoutVoice from "./scenarios/check-without-voice.ts";
import fromScript from "./scenarios/from-script.ts";
import jaLineBreak from "./scenarios/ja-line-break.ts";
import lowContrast from "./scenarios/low-contrast.ts";
import missingImage from "./scenarios/missing-image.ts";
import mistypedDeck from "./scenarios/mistyped-deck.ts";
import overTime from "./scenarios/over-time.ts";
import overflow from "./scenarios/overflow.ts";
import refEdit from "./scenarios/ref-edit.ts";
import renamedSection from "./scenarios/renamed-section.ts";
import startFromNothing from "./scenarios/start-from-nothing.ts";

/** Every scenario, in the order a run takes them. */
export const scenarios: Scenario[] = [
  startFromNothing,
  fromScript,
  overflow,
  missingImage,
  renamedSection,
  lowContrast,
  jaLineBreak,
  overTime,
  mistypedDeck,
  refEdit,
  checkWithoutVoice,
];
