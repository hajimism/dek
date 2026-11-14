import type { TalkCard } from "../../../deck/type.ts";
import type { Profile } from "../../type.ts";

/**
 * One page of a person's profile, as anyone who opens it sees it. `github` is the GitHub login of
 * an account made with GitHub, for the page to link to; a handle is chosen, so it may be another.
 */
export type ProfilePage = Profile & {
  github: string | null;
  isOwner: boolean;
  talks: TalkCard[];
  /** Which page this is, from 1, and how many talks there are on every page together. */
  page: number;
  total: number;
  /** The canonical URL of this page. */
  url: string;
};
