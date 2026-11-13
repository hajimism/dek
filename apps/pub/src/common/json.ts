// A column that holds JSON, read back as the shape it was written in.

import type { z } from "zod";

export function readJson<S extends z.ZodType>(schema: S, text: string): z.output<S> {
  return schema.parse(JSON.parse(text));
}
