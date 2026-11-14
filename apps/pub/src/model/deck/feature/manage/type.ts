// The owner's dashboard of a deck: its settings and grants, and the version readers see.

/** The current version, as the dashboard tells it: when it came, what it said, what it changed. */
export type CurrentVersion = {
  n: number;
  createdAt: string;
  message: string | null;
  /** Slugs whose slide or script differs from the version before. */
  changed: string[];
};
