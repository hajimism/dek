// How a profile shows its talks: covers in a grid, the default, or a list by year.

export type ProfileView = "gallery" | "timeline";

/** The view an address asks for with `?view=`; anything else is the gallery. */
export function profileView(asked: string | undefined | null): ProfileView {
  return asked === "timeline" ? "timeline" : "gallery";
}
