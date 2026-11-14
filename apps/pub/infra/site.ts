// The names each stage of dek.pub runs under, apart from the Alchemy program that declares them so
// a test can hold them to the app's defaults and the serve Worker's route (ADR 70). Only `prod` is
// named: staging's hostnames are decided with the staging configuration ADR 43 asks for.

/** A zone Alchemy takes over once its domain is registered, and what it says about mail. */
export type SiteZone = {
  name: string;
  /** The apex's SPF: neither domain sends mail itself. */
  spf: string;
  /** The apex's DMARC policy, which also covers every subdomain that has none of its own. */
  dmarc: string;
};

export type Site = {
  /** The app's host, as `APP_ORIGIN` names it. */
  app: string;
  /** The host decks are served under, one subdomain each, as `DECK_ORIGIN` names it. */
  decks: string;
  /** The serve Worker's route; a route takes a wildcard only at the start of its host. */
  deckRoute: string;
  zones: SiteZone[];
};

// Mail comes only from mail.dek.pub, through Cloudflare Email Sending (ADR 53), whose records
// `void deploy` writes. The apex rejects whatever fails; a subdomain without its own policy, the
// sending one included until its records are checked, is quarantined rather than lost.
const NO_MAIL = {
  spf: "v=spf1 -all",
  dmarc: "v=DMARC1; p=reject; sp=quarantine",
};

const PROD: Site = {
  app: "dek.pub",
  decks: "dekusercontent.com",
  deckRoute: "*.dekusercontent.com/*",
  zones: [
    { name: "dek.pub", ...NO_MAIL },
    { name: "dekusercontent.com", ...NO_MAIL },
  ],
};

export function siteFor(stage: string): Site {
  if (stage === "prod") {
    return PROD;
  }
  throw new Error(
    stage === "staging"
      ? "staging has no hostnames yet: they are decided with the staging configuration (ADR 43)"
      : `the stage "${stage}" names no site; deploy with --stage prod`,
  );
}
