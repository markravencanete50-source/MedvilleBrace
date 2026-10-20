# Medville Brace

Storefront and admin dashboard (front end first). Next.js 16, React 19, TypeScript.

```bash
npm ci
npm run dev        # http://localhost:3000
npx tsc --noEmit
npm run build
```

## Admin

`/admin` (development passcode shown on the sign-in screen; replace with real auth).

- **Products**: add/edit/delete, inline stock, and status: In stock, Sold out, Pending, Coming soon, Draft/hidden.
- **Orders**: change status (Pending, Paid, Processing, Shipped, Delivered, Cancelled, Refunded), notes, ship-to details. Cancelling or refunding restocks items.
- **Carts**: live visitor carts, abandoned detection (idle > 1 hour), remove lines, delete.

## Data

No backend yet. All data lives in `localStorage` through `lib/store.ts`, so the storefront and admin
share it **in one browser only**. Swap that file for API calls when the backend is connected.
Seed products in `lib/seed.ts` are placeholders and ship with no photos.

## To do

- Real brand kit: replace the placeholder tokens at the top of `app/globals.css`.
- Real, licensed product photos and final catalogue/copy.
- Auth, database, payments, email (API keys later).
