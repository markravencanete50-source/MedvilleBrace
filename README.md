# Medville Brace

An online store for orthopedic braces, supports and recovery products: 578 products from 12 manufacturers (Ossur, Breg, Bauerfeind, Aspen, OCSI, Ottobock and others), shopped by body region, device type, condition or brand.

Built with Vite, React 18, TypeScript, Tailwind CSS 4 and React Router. Static output: every address is prerendered with its own title, description, canonical link, Open Graph tags and JSON-LD.

## Hosting: four services, each with one job

| Service | Job | Sees customer data? |
|---|---|---|
| Vercel (Hobby plan) | Serves the website (`dist/`) with the headers in `vercel.json` | No |
| Cloudinary | Serves product and lifestyle photographs | No |
| Firebase (Spark plan, no Cloud Functions) | Staff sign-in, store content and daily order counts for the dashboard | No: counts only, never names, emails, addresses, notes or order ids |
| AWS (API Gateway + Lambda + DynamoDB, in `aws/`) | Receives and stores order requests; serves the order dashboard's data and the figures sync | Yes: deploy only in the AWS account with the BAA in effect |

Order data never touches Vercel, Firebase or Cloudinary: the browser posts it straight to the order API on AWS, and the dashboard reads it straight from there too. Vercel only serves static files. It runs no Vercel functions and has no Vercel Analytics, so it never needs a BAA here. Keep it that way: never proxy the order API through Vercel, and never add Vercel features that read form input.

The Vercel Hobby plan is for personal, non-commercial use under Vercel's terms. Move the project to Pro before the store sells.

## Run it

```bash
npm install
npm run dev        # local development
npm run build      # pull store content, type-check, build, prerender ~650 pages, sitemap and robots.txt
npm run preview    # serve the built site on http://localhost:4173
npm run audit      # catalog and content checks (run after build)
npm run test:orders # order, dashboard and figures tests
```

`npm run dev` and `npm run build` first copy the store content from Firebase into `src/data/content.json` (gitignored). The build stops if Firebase cannot be read.

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

The screens are grouped in the menu.

**Orders**

- **Overview**: totals for any date range (requests, value quoted, average request, items, requests waiting on the team, busiest day), a line of requests or value per day, time of day, day of the week, status, most requested products, brands, categories and ship-to states. Clicking a day on the line opens it in the calendar. The figures come from Firebase. Days from before the stack was set up need `npm run figures:rebuild` (see Deploy, step 6).
- **Calendar**: one month at a time, each day showing its number of requests and value, shaded by how busy it was. Picking a day shows that day's figures (requests, value, items, cancelled, hour by hour, status, products) and its orders.
- **Orders**: every request, newest first, filtered by date range and status and searched in the browser. An order opens in a side panel: customer, ship-to address, items with options, SKUs and prices, the customer's note, a status (new, contacted, confirmed, shipped, completed, cancelled) and an internal note. Export to CSV asks first and is logged.

**Store**

- **Products**: hide a product, or change a variant's price or mark it out of stock. Order intake applies these within a minute. The website shows them after its next rebuild.
- **Questions**: edit the questions and answers on the FAQ page.
- **Store details** (owners only): the contact email and phone, opening hours, the free shipping threshold, the return period and the notice shown on the site. The website shows these after its next rebuild.

Publish rebuilds the website. Store content is saved to Firebase, and the site reads it only when it is built. The public site never calls Firebase.

**Account**

- **Team** (owners only): invite people as Owner or Staff, change roles, switch accounts off, remove them. Shared mailboxes are refused.
- **Access log** (owners only): who opened, changed or downloaded orders, who changed the team, and who was refused.

Staff see Overview, Calendar, Orders, Products and Questions. Owners see every screen.

Days are counted in `BUSINESS_TIME_ZONE` (`src/data/site.ts`, default America/New_York, matching the support hours) on every screen and on the server.

How it is protected:

- Sign-in is Firebase Authentication (email and password) in the Firebase project. An owner invites people from Team. Firebase then emails a link so the person can choose a password. No temporary passwords are sent. Sessions live in the tab's session storage and end after 20 idle minutes.
- Each person's role is a Firebase custom claim, `role`. Only the AWS admin Lambda sets it, using a service account, so the browser cannot grant itself a role. Firestore rules check the same claim.
- `POST /admin` on the same API Gateway requires a valid Firebase ID token (JWT authorizer). The `medville-brace-admin` Lambda then reads the person's account and role from Firebase on every request (cached 30 seconds), so a removed, switched-off or demoted person is refused at once. Staff can work with orders, figures and store content; only owners reach Store details, Team and the access log.
- Every order list, order opened, change, figure and export is written to `medville-brace-audit` (KMS encrypted, point-in-time recovery, deletion protection). The log names who and when, never what a customer wrote.
- The figures are computed on the server from dates, statuses, products and states only; no names or addresses are read for them. Only counts and sums are written to Firebase.
- No order id ever appears in a URL: everything is a POST, and an order opens in a panel, not at its own address.

Two-step sign-in is not switched on yet. It is the next thing to add if the team wants it.

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

Set up in this order. Each step uses the output of the step before it.

1. **Firebase project.** In the Firebase console, create a project on the Spark plan. No Cloud Functions are needed. Under Authentication, turn on Email/Password sign-in. Create a Firestore database, then deploy the security rules:

   ```bash
   npx firebase-tools deploy --only firestore --project <id>
   ```

   Register a Web app under Project settings. Its config gives the `VITE_FIREBASE_*` values.

2. **Service account key.** Under Project settings, Service accounts, create a key for the project. The account needs the roles Firebase Authentication Admin and Cloud Datastore User. Store the key in AWS Secrets Manager. Run this signed in to the AWS account that has the BAA in effect, with the AWS CLI v2:

   ```bash
   npm run google:key -- path/to/key.json
   ```

   It prints the secret's ARN, which step 3 needs. Delete the local key file once step 5 is done, because the owner script reads it too.

3. **AWS order stack.** One CloudFormation stack, `medville-brace-orders` in `us-east-1`, in the AWS account that has the BAA in effect (the same account as Medville Diabetes; the stacks share nothing). It creates:

   - an HTTP API with one route, `POST /orders`, throttled to 10 requests a second;
   - the `medville-brace-orders` Lambda (Node.js 22), which checks the origin, validates the request, prices it from `aws/catalog.json` and saves it;
   - DynamoDB table `medville-brace-orders`, encrypted with its own KMS key, with point-in-time recovery and deletion protection, kept if the stack is ever deleted;
   - DynamoDB table `medville-brace-order-limits`: hashed per-address hourly counters that expire by TTL, so no IP address is stored;
   - an optional SES sender for the "new order request" email (reference and item count only);
   - the order dashboard's back end: the `POST /admin` route with a JWT authorizer (Firebase ID tokens), the `medville-brace-admin` Lambda, the `medville-brace-audit` table, and the figures Lambda `medville-brace-figures`, which reads a DynamoDB stream of order keys and writes daily counts to Firebase.

   The stack starts closed (`OrdersEnabled=false`): the API answers 503 until it is switched on.

   ```bash
   npm run test:orders
   # AWS CLI v2, signed in to the BAA account; the bucket holds the Lambda code zip
   AWS_DEPLOY_BUCKET=<bucket> ALLOWED_ORIGINS=https://www.<domain>,https://<domain> FIREBASE_PROJECT_ID=<id> GOOGLE_KEY_SECRET_ARN=<arn> npm run deploy:orders            # creates a change set to review
   AWS_DEPLOY_BUCKET=<bucket> FIREBASE_PROJECT_ID=<id> GOOGLE_KEY_SECRET_ARN=<arn> npm run deploy:orders -- --execute                                                 # or applies it directly
   ```

   Add `DEPLOY_HOOK_URL` as well if you already have the hook from step 7. Keep the `OrderEndpoint` output for step 4. The dashboard finds its API at the same address with `/admin` in place of `/orders`, which the `AdminEndpoint` output shows.

4. **Website on Vercel.** In Vercel, import the GitHub repository as a new project. Set the build command to `npm run build` and the output directory to `dist`. The headers, clean URLs and 404 handling come from `vercel.json`. Under Project Settings, Environment Variables, set `VITE_ORDER_ENDPOINT` (the `OrderEndpoint` output) and the four `VITE_FIREBASE_*` values from step 1. Set `VITE_ADMIN_ENDPOINT` only if the dashboard API is not at the same address. Then deploy. The build reads store content from Firebase, so set `VITE_FIREBASE_PROJECT_ID` before the first build. Without it, the build uses the defaults in `src/data/content-defaults.json`. The same names are in `.env.example`.

5. **First owner.** Create the first owner of the dashboard:

   ```bash
   npm run admin:owner -- you@example.com --key path/to/key.json
   ```

   Use a personal address, never a shared one. The account is created with no password, and Firebase emails a link so the person can choose one. The script reads `VITE_FIREBASE_API_KEY` from `.env.production` or the environment to send that email. Without it, no email is sent, and the person can use Forgot password on `<site>/admin`. The owner invites everyone else from Team.

6. **Old figures (optional).** Fill in the daily figures for the last 400 days from the orders table:

   ```bash
   npm run figures:rebuild
   npm run figures:rebuild -- 2026-01-01 2026-03-31   # or a range of days
   ```

   Run it signed in to the BAA account, with the AWS CLI v2. Only counts and sums reach Firebase.

7. **Publish button (optional).** In Vercel, create a deploy hook for the production branch under Project Settings, Git, Deploy Hooks. Then redeploy the stack with the hook's URL, so the dashboard's Publish button can rebuild the website:

   ```bash
   AWS_DEPLOY_BUCKET=<bucket> DEPLOY_HOOK_URL=<hook url> npm run deploy:orders -- --execute
   ```

   The deploy passes only the parameters that are set, so the other values on the stack stay as they are. The hook URL works like a password, so never commit it.

### Notifications and opening orders

- For notifications, deploy again with `SENDER_DOMAIN`, `SENDER_EMAIL` and `NOTIFY_TO`, publish the three DKIM records from the outputs in DNS, and request SES production access (in the SES sandbox the inbox must be verified too).
- When the site, inbox and policies are ready, deploy with `ORDERS_ENABLED=true`.
- Rerun the deploy after every catalog update, so the Lambda prices from the current catalog.
- Keep DynamoDB console access for the account administrator only: reads made there do not reach the access log.

### Photographs to Cloudinary

```bash
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> npm run images:upload
git add src/data/cloudinary.json && git commit -m "chore: Cloudinary image map"
```

Uploads 949 photos under the `medville-brace/` folder and records each one in `src/data/cloudinary.json`. Rerun after a catalog update: only new or changed photos are sent. Once the map has entries, the site requests sized, auto-format images from Cloudinary and the build leaves those local copies out of the deploy.

The team reads and manages orders in the dashboard at `/admin`.

## Before launch

Values marked `PLACEHOLDER` in `src/data/site.ts`:

- `SITE_ORIGIN`: the real domain (also used for canonical links, the sitemap and robots.txt).
- `COMPANY.email`: the inbox that receives order requests. `orders@medvillebrace.com` is a placeholder.
- `COMPANY.phone`, `hours`, `freeShippingFrom`, `returnDays`.

Business items:

- Prices are the source store's listed prices, copied as a starting point. Set your own pricing.
- Product photographs belong to their manufacturers. Confirm reseller or distributor permission with each brand.
- Have the policy pages reviewed; they are written for the request-to-order model but are not legal advice.
