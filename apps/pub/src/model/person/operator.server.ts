// Whether the person calling runs dek.pub, as `DEK_PUB_OPERATORS` says (ADR 82).

import { env } from "void/env";
import { namesOperator, readOperators } from "./operator.ts";
import type { Person } from "./type.ts";

/** The addresses of those who run dek.pub, as `DEK_PUB_OPERATORS` lists them. */
export function operators(): ReadonlySet<string> {
  return readOperators(env.DEK_PUB_OPERATORS);
}

export function isOperator(person: Person): boolean {
  return namesOperator(operators(), person);
}
