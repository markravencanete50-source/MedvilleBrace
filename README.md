# Medville Brace

An online store for orthopedic braces, supports and recovery products: 578 products from 12 manufacturers (Ossur, Breg, Bauerfeind, Aspen, OCSI, Ottobock and others), shopped by body region, device type, condition or brand.

Built with Vite, React 18, TypeScript, Tailwind CSS 4 and React Router. Static output: every address is prerendered with its own title, description, canonical link, Open Graph tags and JSON-LD, so it can be hosted on any static host (Firebase Hosting, Vercel, Netlify, Cloudflare Pages).

## Run it

```bash
npm install
npm run dev        # local development
npm run build      # type-check, build, prerender ~650 pages, sitemap and robots.txt
npm run preview    # serve the built site on http://localhost:4173
npm run audit      # catalog and content checks (run after build)
```

## What is on the site

- Home, shop pages per body region, device type and brand, with filters for type, condition, brand, price and stock, and full-text search (product, brand, condition or billing code).
- Product pages with every size, side and colour option, manufacturer features, typical uses, sizing guidance and billing codes.
- Cart, compare (up to three products), recently viewed, all kept in the visitor's own browser.
- Fit Finder: four questions (region, condition, recovery stage, budget) to a ranked short list.
- Size guide, six original recovery guides, Clinician Partner Program, FAQ, and policy pages (ordering, shipping, returns, warranty, insurance, medical disclaimer, privacy, terms).

## How ordering works

There is no payment on the site. The cart becomes an order request; the team confirms size, stock and the total by email and sends a payment link.

- Set `VITE_ORDER_ENDPOINT` (see `.env.example`) to a URL that accepts the JSON request. Only a successful response shows the "Request received" screen.
- With it empty, the request is written into an email the visitor sends from their own mail app, to `COMPANY.email` in `src/data/site.ts`. The screen says plainly that nothing has been received until that email is sent.

## Catalog pipeline

The catalog and photographs are generated, not hand-edited:

```bash
npm run catalog:fetch     # source product feed -> .cache/raw-products.json
npm run catalog:build     # -> src/data/catalog.json + public/data/p/<slug>.json
npm run images:fetch      # manufacturer photos -> .cache/images/<source id>/
npm run images:optimize   # -> public/products/<slug>/<n>.webp and <n>-sm.webp
```

- Copy: product facts are kept (names, sizes, SKUs, prices, manufacturer features and indications, sizing text, billing codes). Every summary is generated from those facts; the source store's marketing text is not used.
- Private label: the source store's own lines are left out, because their photographs carry its logo and they are not ours to sell. `INCLUDE_PRIVATE_LABEL=1` brings them back under their real names, for use only with a supply agreement.
- Photographs: `scripts/image-blocklist.json` blocks 720 source photos that carry the source store's branding (its guarantee cards, size charts with its logo, product placards, branded clothing) and crops 25 more down to the product. 29 products with no clean photograph show a plain "Photo coming soon" tile, never a stand-in picture.
- Duplicate listings in the source are labelled by the option that tells them apart (colour, side or size), and true duplicates are merged.

Lifestyle photography in `public/photography/` is from Pexels (free licence); see `public/photography/CREDITS.md`.

## Before launch

Values marked `PLACEHOLDER` in `src/data/site.ts`:

- `SITE_ORIGIN`: the real domain (also used for canonical links, the sitemap and robots.txt).
- `COMPANY.email`: the inbox that receives order requests. `orders@medvillebrace.com` is a placeholder.
- `COMPANY.phone`, `hours`, `freeShippingFrom`, `returnDays`.

Business items:

- Prices are the source store's listed prices, copied as a starting point. Set your own pricing.
- Product photographs belong to their manufacturers. Confirm reseller or distributor permission with each brand.
- Have the policy pages reviewed; they are written for the request-to-order model but are not legal advice.
