// What every table's writes share.

import { sql } from "void/db";

/** Now, as the tables keep times: ISO 8601 in UTC, to the millisecond. */
export const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
