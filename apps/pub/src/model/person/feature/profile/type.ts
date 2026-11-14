import type { TalkCard } from "../../../deck/type.ts";
import type { Profile } from "../../type.ts";

/**
 * One page of a person's profile, as anyone who opens it sees it. `github` says the handle is a
 * GitHub login, so the page may link to it.
 */
export type ProfilePage = Profile & {
  github: boolean;
  isOwner: boolean;
  talks: TalkCard[];
  /** Which page this is, from 1, and how many talks there are on every page together. */
  page: number;
  total: number;
  /** The canonical URL of this page. */
  url: string;
};
