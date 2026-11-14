import type { TalkCard } from "../../../deck/type.ts";
import type { Profile } from "../../type.ts";

/**
 * A person's page, as anyone who opens it sees it. `github` says the handle is a GitHub login, so
 * the page may link to it.
 */
export type ProfilePage = Profile & {
  github: boolean;
  isOwner: boolean;
  talks: TalkCard[];
  url: string;
};
