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
│   ├── layouts/Base.astro
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

| Branch | Worker | URL | D1 / R2 |
| --- | --- | --- | --- |
| `main` | `hack-night-demo` | https://banana-shop.cbnsndwch.dev (custom domain) | `hack-night-demo` / `hack-night-demo-media` |
| any other | `hack-night-demo-preview` | `https://<branch>-hack-night-demo-preview.<subdomain>.workers.dev` | `hack-night-demo-preview` / `hack-night-demo-preview-media` |

The D1 databases and R2 buckets already exist on the cbnsndwch account. Previews
use separate storage, so test orders never reach production.

The Astro Cloudflare adapter flattens `wrangler.jsonc` into
`dist/server/wrangler.json` at build time. It picks the env from `CLOUDFLARE_ENV`,
so set that before building and **don't** pass `--env` to wrangler afterwards.

### One-time bootstrap

Both Workers need to exist (and have secrets) before the CI builds can deploy them:

```sh
# production
npx wrangler secret put EMDASH_ENCRYPTION_KEY   # value: npx emdash secrets generate
npx wrangler secret put EMDASH_AUTH_SECRET      # value: openssl rand -hex 32
pnpm deploy                                     # creates the Worker + custom domain

# preview Worker
CLOUDFLARE_ENV=preview pnpm build && npx wrangler deploy
npx wrangler secret put EMDASH_ENCRYPTION_KEY --name hack-night-demo-preview
npx wrangler secret put EMDASH_AUTH_SECRET    --name hack-night-demo-preview
```

### Wire Workers Builds (Dashboard → Workers → *worker* → Settings → Builds → Connect)

Connect **both** Workers to `cbnsndwch/banana-shop`:

**`hack-night-demo`** (production)
- Production branch: `main`
- Build command: `pnpm build`
- Deploy command: `npx wrangler deploy`
- Builds for non-production branches: **off**

**`hack-night-demo-preview`** (branch previews)
- Production branch: `main` (any value works; this Worker only uploads versions)
- Build variable: `CLOUDFLARE_ENV=preview`
- Build command: `pnpm build`
- Deploy command: `npx wrangler versions upload`
- Builds for non-production branches: **on**, with deploy command `npx wrangler versions upload`

Each push to a non-`main` branch uploads a version with a branch-named preview
alias, and the bot comments the URL on the PR. Run it by hand with `pnpm deploy:preview`.

> **Note:** The sandboxed catalog-manager plugin needs the Worker Loader
> (`worker_loaders: [{ "binding": "LOADER" }]`) binding, which requires a
> Workers paid plan. Without it the plugin is disabled at build time and staff
> can still add products in the full admin at `/_emdash/admin/content/products`.

## Orders

Orders are an EmDash `orders` collection. Customers submit via `POST /api/orders`
(which recomputes the total from server-side product prices and writes a
published entry). Staff review and update `order_status` in the admin.
Payment is cash on pickup — no online payment.
