# Shopify Dev Store Data Seeding (Development Only)

This tooling is **development-only** and is intended to create fake customer/order history in a Shopify **development store** for ChurnScout testing.

It is not part of app runtime behavior and must not be used in production stores.

## Safety Notes

- Use only fake data (no real customer names, emails, phone numbers, or addresses).
- Do not commit tokens or secrets.
- Do not add `write_orders` or `write_customers` to ChurnScout app production scopes.
- This script writes directly to Shopify only. It does not persist generated data in ChurnScout's database.

## Script

`scripts/seed-dev-store-data.mjs`

- Uses Shopify GraphQL Admin API directly.
- Creates fake customers and historical orders.
- Tags records with `churnscout-demo-data` and pattern tags like `churnscout-vip-customer`.
- Supports dry-run mode (`--dry-run`) with no Shopify API calls.

## Create a Separate Seed Token (Dev Store)

Create a separate admin token for your dev store (not your production app token):

1. In the dev store admin, create/install a custom app for seeding.
2. Grant only the minimum Admin API scopes needed (below).
3. Reveal/copy the Admin API access token.
4. Store token locally in env vars (do not commit).

Shopify docs:
- Custom app Admin token generation: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin
- Admin API access scopes: https://shopify.dev/docs/admin-api/access-scopes

## Required Scopes for the Seed Token

- `write_customers` (create/tag customers)
- `write_orders` (create/tag orders using `orderCreate`)

Notes:
- `orderCreate` is limited to 5 new orders per minute on trial/development stores. The script includes pacing by default.
- The seed script uses custom line items in `orderCreate` so product/variant setup is not required.

## Environment Variables

Required:

- `SHOPIFY_SEED_STORE_DOMAIN`
  - Example: `your-dev-store.myshopify.com`
- `SHOPIFY_SEED_ADMIN_ACCESS_TOKEN`
  - Admin API access token from the separate seed app/token

Optional:

- `SHOPIFY_SEED_API_VERSION`
  - If unset, script reads `api_version` from `shopify.app.toml` (currently `2026-07` in this repo).

## Usage

Dry-run (no Shopify writes):

```bash
npm run seed:dev-store -- --dry-run
```

Dry-run with custom customer count:

```bash
npm run seed:dev-store -- --dry-run --customers=30
```

Actual seeding run:

```bash
npm run seed:dev-store
```

Example with env vars inline:

```bash
SHOPIFY_SEED_STORE_DOMAIN=your-dev-store.myshopify.com \
SHOPIFY_SEED_ADMIN_ACCESS_TOKEN=shpat_xxx \
npm run seed:dev-store
```

## What Gets Generated

- 20-50 fake customers (default 24, configurable with `--customers=20..50`)
- Each customer gets 1-8 fake historical orders
- Pattern mix includes:
  - New customer
  - Repeat customer
  - Loyal customer
  - VIP customer
  - At-risk customer
  - Lost customer
- Fake naming/email format:
  - `ChurnScout Demo Customer 001`
  - `churnscout-demo+001@example.com`

## Troubleshooting

- If you see scope/auth errors, verify the separate seed token has `write_customers` and `write_orders`.
- If you hit rate-limit errors, keep the default order delay or increase it with `--order-delay-ms=...`.
