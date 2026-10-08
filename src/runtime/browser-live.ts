// The player of the dev server's pages: the same player, with its line to the server.

import { createDevLine } from "./dev-line.ts";
import { startPlayer } from "./start.ts";

startPlayer(createDevLine);
