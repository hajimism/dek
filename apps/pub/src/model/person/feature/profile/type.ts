import type { TalkCard } from "../../../deck/type.ts";
import type { Profile } from "../../type.ts";

/** One page of a person's profile, as anyone who opens it sees it. */
export type ProfilePage = Profile & {
  /** The links the person put on their profile, in their order. */
  links: string[];
  isOwner: boolean;
  talks: TalkCard[];
  /** Which page this is, from 1, and how many talks there are on every page together. */
  page: number;
  total: number;
  /** The canonical URL of this page. */
  url: string;
};
