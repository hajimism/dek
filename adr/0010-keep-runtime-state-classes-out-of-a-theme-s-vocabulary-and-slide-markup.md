# 10. Keep runtime state classes out of a theme's vocabulary and slide markup

Date: 2026-10-06

## Status

Accepted

## Context

The player sets two classes as the talk moves: `is-current` on the slide on screen, and `is-shown` on each `data-step` element once its beat plays. A theme selects them, as `.slide.is-current [data-step].is-shown`, so they appear among the classes its selectors name.

That one list served three purposes. `dekc theme` printed it as the classes an agent may use, DEK013 counted it against `max_classes`, and DEK010 accepted any class in it in a slide's markup. An agent that read `dekc theme` saw `is-current` and `is-shown` beside `slide-title`, and nothing told it not to write them. Markup that writes one claims a state before the player sets it: a slide written `class="slide is-current"` shows before the runtime has picked it. Lint passed the slide, which broke criterion 2 (conventions match checks). A theme's budget was also two classes smaller than it looked.

## Decision

`is-current` and `is-shown` are the player's state classes, held in one constant (`RUNTIME_CLASSES` in `src/core/theme-facts.ts`), and none of the theme's vocabulary.

- `dekc theme` lists the classes markup may use under `classes`, and the state classes the theme selects under a new `stateClasses` field. The text output prints them in their own section that says the player sets them. The `--json` shape gains `stateClasses`.
- DEK013 counts only `classes`, so the budget an agent reads in `dekc theme` is the one lint applies.
- DEK010 reports a state class written in a slide's `class` attribute. Its message says the player sets the class, its hint says to remove it and select the state in CSS instead, and its data carries `state: true`. DEK010's list of classes to use leaves the state classes out. A slide stylesheet may still select them.
- The AGENTS.md block says to select them in CSS and never write them in markup, and cites `DEK010`.

## Consequences

`dekc theme`, DEK013, and DEK010 agree on what a theme's vocabulary is, and the AGENTS.md convention has a rule that checks it.

A slide that wrote `is-current` or `is-shown` in its markup now fails lint. No bundled theme or sample does. A theme that was near its `max_classes` because it selects the state classes gets two classes of room back.

A runtime class added later goes in `RUNTIME_CLASSES` too. `measureSlideInPage` in `src/core/slide-measure.ts` keeps its own copy of the list, since it is serialized into the page and cannot import, so it has to be updated along with the constant.
