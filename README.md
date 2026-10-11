# Medville Brace

An online store for orthopedic braces, supports and recovery products: 578 products from 12 manufacturers (Ossur, Breg, Bauerfeind, Aspen, OCSI, Ottobock and others), shopped by body region, device type, condition or brand.

Built with Vite, React 18, TypeScript, Tailwind CSS 4 and React Router. Static output: every address is prerendered with its own title, description, canonical link, Open Graph tags and JSON-LD.

## Hosting: three services, each with one job

| Service | Job | Sees customer data? |
|---|---|---|
| Cloudflare (Workers static assets) | Serves the website (`dist/`) | No |
| Cloudinary | Serves product and lifestyle photographs | No |
| AWS (API Gateway + Lambda + DynamoDB, in `aws/`) | Receives and stores order requests | Yes: deploy only in the AWS account with the BAA in effect |

Order data never touches Cloudflare or Cloudinary: the browser posts it straight to the order API on AWS. That is why the free Cloudflare plan is enough: Cloudflare offers a BAA only on Enterprise, and it never needs one here. Keep it that way: never proxy the order API through Cloudflare, and never add Cloudflare features that read form input.

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

### 2. Order intake on AWS

One CloudFormation stack, `medville-brace-orders` in `us-east-1`, in the AWS account that has the BAA in effect (the same account as Medville Diabetes; the stacks share nothing). It creates:

- an HTTP API with one route, `POST /orders`, throttled to 10 requests a second;
- the `medville-brace-orders` Lambda (Node.js 22), which checks the origin, validates the request, prices it from `aws/catalog.json` and saves it;
- DynamoDB table `medville-brace-orders`, encrypted with its own KMS key, with point-in-time recovery and deletion protection, kept if the stack is ever deleted;
- DynamoDB table `medville-brace-order-limits`: hashed per-address hourly counters that expire by TTL, so no IP address is stored;
- an optional SES sender for the "new order request" email (reference and item count only).

The stack starts closed (`OrdersEnabled=false`): the API answers 503 until it is switched on.

```bash
npm run test:orders
# AWS CLI v2, signed in to the BAA account; the bucket holds the Lambda code zip
AWS_DEPLOY_BUCKET=<bucket> ALLOWED_ORIGINS=https://www.<domain>,https://<domain> npm run deploy:orders            # creates a change set to review
AWS_DEPLOY_BUCKET=<bucket> npm run deploy:orders -- --execute                                                       # or applies it directly
```

Then:

1. Put the `OrderEndpoint` output in `VITE_ORDER_ENDPOINT` (`.env` and the Cloudflare build settings).
2. For notifications, deploy again with `SENDER_DOMAIN`, `SENDER_EMAIL` and `NOTIFY_TO`, publish the three DKIM records from the outputs in DNS, and request SES production access (in the SES sandbox the inbox must be verified too).
3. When the site, inbox and policies are ready, deploy with `ORDERS_ENABLED=true`.
4. Rerun the deploy after every catalog update, so the Lambda prices from the current catalog.

Orders are read in the DynamoDB console (`medville-brace-orders`, Explore items). Give that access only to the people who handle orders, through IAM.

### 3. Website on Cloudflare

Either connect the GitHub repository in the Cloudflare dashboard (Workers & Pages, build command `npm run build`, deploy command `npx wrangler deploy`, environment variable `VITE_ORDER_ENDPOINT`), or deploy from this machine:

```bash
npm run deploy:cloudflare
```

`wrangler.jsonc` serves `dist/` with a real 404 page; `public/_headers` sets caching and security headers, including a Content-Security-Policy that allows only Cloudinary images and requests to the order API on AWS. Pages are written as `<path>.html`, which Cloudflare serves at the canonical address without a trailing slash.

## Before launch

Values marked `PLACEHOLDER` in `src/data/site.ts`:

- `SITE_ORIGIN`: the real domain (also used for canonical links, the sitemap and robots.txt).
- `COMPANY.email`: the inbox that receives order requests. `orders@medvillebrace.com` is a placeholder.
- `COMPANY.phone`, `hours`, `freeShippingFrom`, `returnDays`.

Business items:

- Prices are the source store's listed prices, copied as a starting point. Set your own pricing.
- Product photographs belong to their manufacturers. Confirm reseller or distributor permission with each brand.
- Have the policy pages reviewed; they are written for the request-to-order model but are not legal advice.
