# Hack Night Bakery 🍌🍞

An EmDash CMS site on Cloudflare Workers — a small online shop selling banana
bread and granola via order forms with **cash on pickup**. Built for a hack
night demo.

## Stack

- [EmDash](https://emdashcms.com) — Astro-native CMS (`emdash@1.4.0`)
- [Astro 7](https://astro.build) with the Cloudflare adapter (`output: server`)
- Cloudflare Workers + D1 (database) + R2 (media)
- A sandboxed **catalog-manager** plugin (Block Kit admin UI) so staff can add
  products without the full content editor

## Structure

```
.
├── astro.config.mjs        # Astro + EmDash (D1/R2) + sandboxed plugin
├── wrangler.jsonc          # Worker, D1, R2, cron, LOADER binding
├── seed/seed.json          # Schema: products + orders collections, category taxonomy
├── src/
│   ├── worker.ts           # Cloudflare Worker entry (scheduled handler)
│   ├── live.config.ts      # EmDash live collections boilerplate
│   ├── layouts/ layouts/Base.astro
│   └── pages/              # storefront, order form, /api/orders, confirmation
└── catalog-manager/        # sandboxed plugin: friendly product catalog UI
    └── src/plugin.ts
```

## Develop

```sh
pnpm install
pnpm dev          # http://localhost:4321  (admin at /_emdash/admin)
```

First run applies the seed schema on the local D1. Apply sample content with:

```sh
npx emdash seed seed/seed.json --validate
```

## Deploy

1. Provision resources (cbnsndwch account):
   ```sh
   npx wrangler d1 create hack-night-demo
   npx wrangler r2 bucket create hack-night-demo-media   # enable R2 in dashboard first
   ```
   Put the D1 `database_id` into `wrangler.jsonc`.

2. Set Worker secrets:
   ```sh
   npx emdash secrets generate   # → EMDASH_ENCRYPTION_KEY
   openssl rand -hex 32          # → EMDASH_AUTH_SECRET
   npx wrangler secret put EMDASH_ENCRYPTION_KEY
   npx wrangler secret put EMDASH_AUTH_SECRET
   ```

3. Build & deploy:
   ```sh
   pnpm build
   npx wrangler deploy           # main → workers.dev subdomain
   ```

## Branch previews

Non-`main` branches deploy to random `*.workers.dev` subdomains via the
`[env.preview]` in `wrangler.jsonc` (`wrangler deploy --env preview`), or wire
Wrangler's GitHub integration for automatic branch previews.

> **Note:** The sandboxed catalog-manager plugin needs the Worker Loader
> (`worker_loaders: [{ "binding": "LOADER" }]`) binding, which requires a
> Workers paid plan. Without it the plugin is disabled at build time and staff
> can still add products in the full admin at `/_emdash/admin/content/products`.

## Orders

Orders are an EmDash `orders` collection. Customers submit via `POST /api/orders`
(which recomputes the total from server-side product prices and writes a
published entry). Staff review and update `order_status` in the admin.
Payment is cash on pickup — no online payment.
