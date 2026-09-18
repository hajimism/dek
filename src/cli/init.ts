import { join, resolve } from "node:path";
import { DekError, writeFrontmatterSchema } from "../core/index.ts";
import { isDeckName } from "../core/path.ts";
import {
  createDeck,
  defaultRumdl,
  defaultTheme,
  defaultToml,
  ensureDir,
  trackWrite,
  writeIfMissing,
} from "./files.ts";

export type InitResult = {
  root: string;
  created: string[];
};

export function initCommand(options: { cwd: string; dir?: string; deck?: string }): InitResult {
  const root = resolve(options.cwd, options.dir ?? ".");
  const created: string[] = [];

  trackWrite(created, root, ensureDir(root));
  trackWrite(
    created,
    join(root, "dek.toml"),
    writeIfMissing(join(root, "dek.toml"), defaultToml()),
  );
  trackWrite(
    created,
    join(root, "theme.css"),
    writeIfMissing(join(root, "theme.css"), defaultTheme()),
  );
  trackWrite(
    created,
    join(root, ".rumdl.toml"),
    writeIfMissing(join(root, ".rumdl.toml"), defaultRumdl()),
  );
  trackWrite(created, join(root, "assets"), ensureDir(join(root, "assets")));
  trackWrite(created, join(root, "decks"), ensureDir(join(root, "decks")));
  created.push(writeFrontmatterSchema(root));

  if (options.deck) {
    if (!isDeckName(options.deck)) {
      throw new DekError(`invalid deck name "${options.deck}"`, {
        hint: "use a name without path separators",
      });
    }
    created.push(...createDeck(root, options.deck, join(root, "theme.css")));
  }

  return { root, created };
}
