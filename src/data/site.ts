/*
  Facts about the business, in one place.

  Contact details and shipping terms come from the dashboard (see COMPANY).
  SITE_ORIGIN is also read by scripts/prerender.mjs for canonical links, the
  sitemap and robots.txt, so connecting the real domain is a one-line change.
*/
import { CONTENT } from "./content";

export const SITE_ORIGIN = "https://REPLACE-WITH-FINAL-DOMAIN"; // PLACEHOLDER

export const SITE_NAME = "Medville Brace";
export const SITE_TAGLINE = "Support that fits your recovery.";

/* Contact details and shipping terms are edited in the dashboard (Store details); src/data/content-defaults.json holds the values used until then. */
export const COMPANY = {
  email: CONTENT.settings.email,
  phone: CONTENT.settings.phone,
  hours: CONTENT.settings.hours,
  freeShippingFrom: CONTENT.settings.freeShippingFrom,
  returnDays: CONTENT.settings.returnDays,
  country: "United States",
};

/* The order dashboard counts days in this time zone, so a day matches the support hours above.
   Keep it equal to BusinessTimeZone on the AWS stack. PLACEHOLDER: confirm with the owner. */
export const BUSINESS_TIME_ZONE = "America/New_York";

/* Where the Request Order form posts. Empty means the email fallback. */
export const ORDER_ENDPOINT: string = import.meta.env?.VITE_ORDER_ENDPOINT ?? "";
