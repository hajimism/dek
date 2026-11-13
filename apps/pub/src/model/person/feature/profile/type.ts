import type { TalkCard } from "../../../deck/type.ts";
import type { Profile } from "../../type.ts";

/** A person's page, as anyone who opens it sees it. */
export type ProfilePage = Profile & { isOwner: boolean; talks: TalkCard[]; url: string };
