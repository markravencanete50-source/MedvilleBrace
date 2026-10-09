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

## Ordering

- No card details are ever collected on the site.
- With `VITE_ORDER_ENDPOINT` unset, the order request becomes a `mailto:` email. Never show "Request received" unless a server accepted the request.
- Automated browser tests must not submit the order form while the endpoint is unset: it opens the mail app on the machine running the test.

## Checks before a push

```bash
npm run build && npm run audit
```

Then look at the home, a region page, a product page and the order form at 390px and at desktop width.
