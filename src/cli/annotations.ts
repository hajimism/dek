import type { AnnotationRow } from "../core/annotation-rows.ts";
import { clearAnnotations, listAnnotations } from "../core/annotations.ts";
import type { DeckTarget } from "./scope.ts";

export type AnnotationsCliResult =
  | { action: "list"; annotations: AnnotationRow[] }
  | { action: "clear"; cleared: number };

/**
 * `dekc annotations`: the notes a human wrote on elements of the slides in annotate mode, each
 * element where the file has it now. It reads the project's file, so no dev server is needed.
 */
export async function annotationsCommand({
  project,
  deck,
}: DeckTarget): Promise<AnnotationsCliResult> {
  return { action: "list", annotations: listAnnotations(project.root, deck) };
}

/** `dekc annotations clear`: drop the deck's notes, once the human has seen them dealt with. */
export async function clearAnnotationsCommand({
  project,
  deck,
}: DeckTarget): Promise<AnnotationsCliResult> {
  return { action: "clear", cleared: clearAnnotations(project.root, deck) };
}
