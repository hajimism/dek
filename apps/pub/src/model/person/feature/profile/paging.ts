// A profile's talks come 24 at a time. Show more loads the next 24 in place; `?page=` names each
// 24 as a page of its own, for a crawler or a browser without scripts (ADR 74).

import { profilePath } from "../../profile-path.ts";
import type { ProfileView } from "./view.ts";

export const TALKS_PER_PAGE = 24;

/** The page an address asks for with `?page=`: a whole number from 1, else the first. */
export function profilePage(asked: string | undefined | null): number {
  return asked && /^[1-9]\d*$/.test(asked) ? Number(asked) : 1;
}

/** How many pages `total` talks fill; a profile with none still has its one. */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / TALKS_PER_PAGE));
}

/** The address of a profile's page in a view, leaving out the first page and the gallery. */
export function profileHref(handle: string, view: ProfileView, page: number): string {
  const query = new URLSearchParams();
  if (view !== "gallery") {
    query.set("view", view);
  }
  if (page > 1) {
    query.set("page", String(page));
  }
  const search = query.toString();
  return search ? `${profilePath(handle)}?${search}` : profilePath(handle);
}
