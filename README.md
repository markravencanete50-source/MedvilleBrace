# Medville Brace

An online store for orthopedic braces, supports and recovery products: 578 products from 12 manufacturers (Ossur, Breg, Bauerfeind, Aspen, OCSI, Ottobock and others), shopped by body region, device type, condition or brand.

Built with Vite, React 18, TypeScript, Tailwind CSS 4 and React Router. Static output: every address is prerendered with its own title, description, canonical link, Open Graph tags and JSON-LD.

## Hosting: three services, each with one job

| Service | Job | Sees customer data? |
|---|---|---|
| Cloudflare (Workers static assets) | Serves the website (`dist/`) | No |
| Cloudinary | Serves product and lifestyle photographs | No |
| Google Cloud via Firebase (Cloud Run function + Firestore) | Receives and stores order requests | Yes: accept the Google Cloud BAA on this project |

Order data never touches Cloudflare or Cloudinary: the browser posts it straight to the `orderRequest` function.

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

## Deploy

### 1. Photographs to Cloudinary

```bash
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> npm run images:upload
git add src/data/cloudinary.json && git commit -m "chore: Cloudinary image map"
```

Uploads 949 photos under the `medville-brace/` folder and records each one in `src/data/cloudinary.json`. Rerun after a catalog update: only new or changed photos are sent. Once the map has entries, the site requests sized, auto-format images from Cloudinary and the build leaves those local copies out of the deploy.

### 2. Order intake on Google Cloud (Firebase)

1. In the client's Google account, create the project, switch it to the Blaze plan, and accept the Google Cloud BAA (only Firestore and Cloud Run functions hold order data, both covered products).
2. Put its id in `.firebaserc`, copy `functions/.env.example` to `functions/.env` and fill it in.
3. Create the Firestore database, then:
   ```bash
   cd functions && npm install && cd ..
   firebase functions:secrets:set RATE_LIMIT_SECRET
   firebase functions:secrets:set RESEND_API_KEY
   npm run test:functions
   npm run deploy:functions
   ```
4. Put the function's URL in `.env` as `VITE_ORDER_ENDPOINT` (also in the Cloudflare build settings).
5. In the Firestore console add a TTL policy on `orderLimits.expiresAt`, and turn on Data Access audit logs and point-in-time recovery.

Orders are read in the Firestore console (`orderRequests`). The notification email carries only the reference and item count.

### 3. Website on Cloudflare

Either connect the GitHub repository in the Cloudflare dashboard (Workers & Pages, build command `npm run build`, deploy command `npx wrangler deploy`, environment variable `VITE_ORDER_ENDPOINT`), or deploy from this machine:

```bash
npm run deploy:cloudflare
```

`wrangler.jsonc` serves `dist/` with a real 404 page; `public/_headers` sets caching and security headers, including a Content-Security-Policy that allows only Cloudinary images and Google Cloud function requests. Pages are written as `<path>.html`, which Cloudflare serves at the canonical address without a trailing slash.

## Before launch

Values marked `PLACEHOLDER` in `src/data/site.ts`:

- `SITE_ORIGIN`: the real domain (also used for canonical links, the sitemap and robots.txt).
- `COMPANY.email`: the inbox that receives order requests. `orders@medvillebrace.com` is a placeholder.
- `COMPANY.phone`, `hours`, `freeShippingFrom`, `returnDays`.

Business items:

- Prices are the source store's listed prices, copied as a starting point. Set your own pricing.
- Product photographs belong to their manufacturers. Confirm reseller or distributor permission with each brand.
- Have the policy pages reviewed; they are written for the request-to-order model but are not legal advice.
