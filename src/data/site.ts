/*
  Facts about the business, in one place.

  Every value marked PLACEHOLDER must be confirmed by the owner before launch.
  SITE_ORIGIN is also read by scripts/prerender.mjs for canonical links, the
  sitemap and robots.txt, so connecting the real domain is a one-line change.
*/
export const SITE_ORIGIN = "https://REPLACE-WITH-FINAL-DOMAIN"; // PLACEHOLDER

export const SITE_NAME = "Medville Brace";
export const SITE_TAGLINE = "Support that fits your recovery.";

export const COMPANY = {
  email: "orders@medvillebrace.com", // PLACEHOLDER: the inbox that receives order requests
  phone: "", // PLACEHOLDER: leave empty until a number is live; the site hides it
  hours: "Monday to Friday, 9 am to 5 pm Eastern", // PLACEHOLDER
  freeShippingFrom: 75, // PLACEHOLDER: order value, in US dollars
  returnDays: 30, // PLACEHOLDER
  country: "United States",
};

/* Where the Request Order form posts. Empty means the email fallback. */
export const ORDER_ENDPOINT: string = import.meta.env?.VITE_ORDER_ENDPOINT ?? "";
