// Whether the person calling runs dek.pub, as `DEK_PUB_OPERATORS` says (ADR 82).

import { env } from "void/env";
import { readOperators } from "./operator.ts";
import type { Person } from "./type.ts";

export function isOperator(person: Person): boolean {
  return readOperators(env.DEK_PUB_OPERATORS).has(person.handle);
}
