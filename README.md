# Medville Brace

An online store for orthopedic braces, supports and recovery products: 578 products from 12 manufacturers (Ossur, Breg, Bauerfeind, Aspen, OCSI, Ottobock and others), shopped by body region, device type, condition or brand.

Built with Vite, React 18, TypeScript, Tailwind CSS 4 and React Router. Static output: every address is prerendered with its own title, description, canonical link, Open Graph tags and JSON-LD.

## Hosting: three services, each with one job

| Service | Job | Sees customer data? |
|---|---|---|
| Cloudflare (Workers static assets) | Serves the website (`dist/`) | No |
| Cloudinary | Serves product and lifestyle photographs | No |
| AWS (API Gateway + Lambda + DynamoDB + Cognito, in `aws/`) | Receives and stores order requests; serves the order dashboard's data and sign-in | Yes: deploy only in the AWS account with the BAA in effect |

Order data never touches Cloudflare or Cloudinary: the browser posts it straight to the order API on AWS, and the dashboard reads it straight from there too. That is why the free Cloudflare plan is enough: Cloudflare offers a BAA only on Enterprise, and it never needs one here. Keep it that way: never proxy the order API through Cloudflare, and never add Cloudflare features that read form input.

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

## Order dashboard

At `/admin`, modelled on the Medville Diabetes dashboard. It is part of the same app but loads as its own chunks, so shoppers never download it; the page is `noindex` and never cached.

- **Overview**: totals for any date range (requests, value quoted, average request, items, requests waiting on the team, busiest day), a line of requests or value per day, time of day, day of the week, status, most requested products, brands, categories and ship-to states. Clicking a day on the line opens it in the calendar.
- **Calendar**: one month at a time, each day showing its number of requests and value, shaded by how busy it was. Picking a day shows that day's figures (requests, value, items, cancelled, hour by hour, status, products) and its orders.
- **Orders**: every request, newest first, filtered by date range and status and searched in the browser. An order opens in a side panel: customer, ship-to address, items with options, SKUs and prices, the customer's note, a status (new, contacted, confirmed, shipped, completed, cancelled) and an internal note. Export to CSV asks first and is logged.
- **Team** (owners only): invite people as Owner or Staff, change roles, switch accounts off, remove them. Shared mailboxes are refused.
- **Access log** (owners only): who opened, changed or downloaded orders, who changed the team, and who was refused.

Days are counted in `BUSINESS_TIME_ZONE` (`src/data/site.ts`, default America/New_York, matching the support hours) on every screen and on the server.

How it is protected:

- Sign-in is an Amazon Cognito user pool in the BAA account. Accounts are created only by an owner (or `npm run admin:create` for the first one); Cognito emails a temporary password and the person chooses their own at first sign-in. Passwords are at least 12 characters. Sessions live in the tab's session storage and end after 20 idle minutes.
- `POST /admin` on the same API Gateway requires a valid Cognito ID token (JWT authorizer). The `medville-brace-admin` Lambda then reads the person's account and group from Cognito on every request (cached 30 seconds), so a removed or switched-off person is refused at once. Staff can work with orders and figures; only owners reach Team and the access log.
- Every order list, order opened, change, figure and export is written to `medville-brace-audit` (KMS encrypted, point-in-time recovery, deletion protection). The log names who and when, never what a customer wrote.
- The figures are computed on the server from dates, statuses, products and states only; no names or addresses are read for them.
- No order id ever appears in a URL: everything is a POST, and an order opens in a panel, not at its own address.

Two-step sign-in (TOTP) is not switched on yet; Cognito supports it and it is the next thing to add if the team wants it.

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
- an optional SES sender for the "new order request" email (reference and item count only);
- the order dashboard's back end: the `medville-brace-dashboard` Cognito user pool (groups `owner` and `staff`), the `POST /admin` route with a JWT authorizer, the `medville-brace-admin` Lambda and the `medville-brace-audit` table.

The stack starts closed (`OrdersEnabled=false`): the API answers 503 until it is switched on.

```bash
npm run test:orders
# AWS CLI v2, signed in to the BAA account; the bucket holds the Lambda code zip
AWS_DEPLOY_BUCKET=<bucket> ALLOWED_ORIGINS=https://www.<domain>,https://<domain> npm run deploy:orders            # creates a change set to review
AWS_DEPLOY_BUCKET=<bucket> npm run deploy:orders -- --execute                                                       # or applies it directly
```

Then:

1. Put the `OrderEndpoint` output in `VITE_ORDER_ENDPOINT` and the `DashboardClientId` output in `VITE_COGNITO_CLIENT_ID` (`.env` and the Cloudflare build settings). The dashboard finds its API at the same address with `/admin` in place of `/orders`.
2. Create the first owner: `npm run admin:create -- name@example.com`. They sign in at `<site>/admin` and invite everyone else from Team.
3. For notifications, deploy again with `SENDER_DOMAIN`, `SENDER_EMAIL` and `NOTIFY_TO`, publish the three DKIM records from the outputs in DNS, and request SES production access (in the SES sandbox the inbox must be verified too).
4. When the site, inbox and policies are ready, deploy with `ORDERS_ENABLED=true`.
5. Rerun the deploy after every catalog update, so the Lambda prices from the current catalog.

The team reads and manages orders in the dashboard at `/admin`. Keep DynamoDB console access for the account administrator only: reads made there do not reach the access log.

### 3. Website on Cloudflare

Either connect the GitHub repository in the Cloudflare dashboard (Workers & Pages, build command `npm run build`, deploy command `npx wrangler deploy`, environment variables `VITE_ORDER_ENDPOINT` and `VITE_COGNITO_CLIENT_ID`), or deploy from this machine:

```bash
npm run deploy:cloudflare
```

`wrangler.jsonc` serves `dist/` with a real 404 page; `public/_headers` sets caching and security headers, including a Content-Security-Policy that allows only Cloudinary images, requests to the order API on AWS and dashboard sign-in through Cognito. Pages are written as `<path>.html`, which Cloudflare serves at the canonical address without a trailing slash.

## Before launch

Values marked `PLACEHOLDER` in `src/data/site.ts`:

- `SITE_ORIGIN`: the real domain (also used for canonical links, the sitemap and robots.txt).
- `COMPANY.email`: the inbox that receives order requests. `orders@medvillebrace.com` is a placeholder.
- `COMPANY.phone`, `hours`, `freeShippingFrom`, `returnDays`.

Business items:

- Prices are the source store's listed prices, copied as a starting point. Set your own pricing.
- Product photographs belong to their manufacturers. Confirm reseller or distributor permission with each brand.
- Have the policy pages reviewed; they are written for the request-to-order model but are not legal advice.
