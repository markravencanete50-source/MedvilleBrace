# Medville Brace: notes for Claude Code

Read README.md first. These are the rules that keep the site honest and on brand.

## Brand

- Palette from the live medvillediabetes.com stylesheet: navy #00293B, cyan #18BADA and white, plus the derived tints in `src/index.css`. No orange, no green, no neutral grey. No raw hex in components; add a token.
- Buttons are cyan or navy only (`src/components/Button.tsx`); hover swaps one for the other. Text on cyan is navy, text on navy is white. Never white on cyan.
- Fonts: Poppins (display) and Inter (body).
- The logo is original (`src/components/Logo.tsx`, `public/brand/mark.svg`): two brace uprights, two straps and a hinge. Never use the Medville Diabetes logo artwork.
- Do not claim an affiliation with Medville Diabetes anywhere on the site.

## Copy

- Plain English, short sentences, no contractions. No long dashes anywhere: copy, comments or docs (`npm run audit` checks).
- No promises about outcomes. Conditions are "commonly used for", never a recommendation. Point to the visitor's clinician.
- Never invent testimonials, reviews, ratings or stock levels.

## Source store

- The catalog comes from another store's public product feed. Its name must not appear in anything the site ships: text (the build scrubs it and `npm run audit` checks) or photographs (the blocklist).
- Its private-label lines are excluded (`INCLUDE_PRIVATE_LABEL`). Do not relabel them under a Medville name.
- New or changed photos must be screened for the source's branding before shipping: guarantee cards, "find your fit" cards, size charts with its logo or watermark, product placards, branded shirts. Add them to `scripts/image-blocklist.json` (keyed by source product id and source photo position), or crop with `crop` boxes.
- Product addresses are built from brand and title, never from the source handle: the source reuses handles across different products.

## Hosting

- Cloudflare Pages or Vercel serves the site from `dist/`, Cloudinary the photos, Firebase staff sign-in, store content and daily counts, and AWS (API Gateway, Lambda and DynamoDB in `aws/`) the orders, the access log and the dashboard API. Only AWS may ever receive customer data, and only in the account with the BAA in effect. The web host never receives customer data: never route the order API through it, never add Vercel or Cloudflare functions, Vercel Analytics, Cloudflare Web Analytics or any other host feature that reads form input.
- Firebase holds no customer data. Never put customer data in Firestore or in any Firebase call. The store content documents and daily figures hold counts and copy only.
- The public bundle must never import `firebase`. `vite.config.ts` `manualChunks` keeps it in admin-only chunks, so shoppers never download it.
- Never log request bodies in `aws/src/`, never echo submitted values in errors, never put customer details in the notification email (tests in `aws/order.test.mjs` guard this).
- Prices for an order come from `aws/catalog.json` (written by `build-catalog.mjs`), never from the browser. Redeploy the order stack after a catalog update.
- The order stack starts closed (`OrdersEnabled=false`). Never delete or replace the orders table, the access-log table or the KMS key; all are retained by design.
- Headers and the CSP live in `vercel.json` and `public/_headers` (Cloudflare Pages). Keep the two in step. A new external origin (image host, API) must be added to the CSP in both, or browsers will block it.
- Image URLs go through `src/lib/cdn.ts`; do not hard-code `/products/...` or Cloudinary URLs in components.

## Order dashboard (`src/admin/`, `aws/src/admin.mjs`)

- Built on the Medville Diabetes dashboard (shell, drawer, charts, access log), but with Medville Brace's palette: navy and cyan, the action colour is cyan under navy type, and danger uses the site's form error red. No orange. The palette lives only in `src/admin/admin.css`.
- Sign-in is Firebase Authentication (email and password, `src/admin/firebase.ts`, session persistence only). Roles are the custom claim `role` (`owner` or `staff`), set only by the AWS admin Lambda with a service account. The Lambda reads the account and role live, never from the token alone. Keep `ACCESS` in `aws/src/admin.mjs`, `ROLE_ACCESS` in `src/admin/auth.tsx` and the rules in `firestore.rules` in step.
- Accounts have no temporary passwords. An invitation creates the account with no password, and Firebase emails a link to choose one (`sendPasswordResetEmail` after admins.invite and admins.resend).
- Screens: Orders (Overview, Calendar, Orders), Store (Products, Questions, Store details) and Account (Team, Access log). Staff get everything except Store details, Team and the access log.
- Every read, change and export of orders writes an access-log entry. A new action must too. Log entries never hold customer details.
- Figures are written to Firestore `figures/<day>` by the AWS figures Lambda (`aws/src/figures.mjs`, `dayDocument()`). They read only the fields in `FIGURE_READ`. Never add names, emails or street addresses to `FIGURE_READ`, and never write an order id into the figures document. `orders.stats` no longer exists.
- Store content (`store/settings`, `store/faqs`, `store/catalog`) is saved to Firestore by the dashboard. `scripts/pull-content.mjs` copies it into the gitignored `src/data/content.json` at each build, and the public site never calls Firebase. Publish calls the admin Lambda's `site.publish`, which POSTs the Vercel deploy hook. Order intake reads `store/catalog` directly, so price, stock and hidden changes apply within a minute.
- The store content shape is shared by `firestore.rules`, `scripts/pull-content.mjs`, `aws/src/content.mjs` and the dashboard (`src/admin/storeContent.ts`). Change all four together.
- Order ids never go into a URL: POST only, and an order opens in a drawer, not at a route.
- Days are business-zone days (`BUSINESS_TIME_ZONE` in `src/data/site.ts`, `BusinessTimeZone` on the stack). Keep the two equal.
- Tests: `aws/admin.test.mjs`. To look at the screens without AWS, run the real handler behind a local stand-in for Firebase and API Gateway with invented orders; never point a local build at the real stack with real orders on screen in a shared session.

## Ordering

- No card details are ever collected on the site.
- With `VITE_ORDER_ENDPOINT` unset, the order request becomes a `mailto:` email. Never show "Request received" unless a server accepted the request.
- Automated browser tests must not submit the order form while the endpoint is unset: it opens the mail app on the machine running the test.

## Checks before a push

```bash
npm run build && npm run audit && npm run test:orders
```

`test:orders` runs `aws/order.test.mjs`, `aws/admin.test.mjs` and `aws/figures.test.mjs`. Then look at the home, a region page, a product page and the order form at 390px and at desktop width.
