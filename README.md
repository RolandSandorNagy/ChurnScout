# ChurnScout

ChurnScout is an embedded Shopify app that detects at-risk customers and surfaces winback opportunities from your store's order history.

Built with the [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router).

## Local Development

### Prerequisites

- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) installed
- A Shopify Partner account and a development store

### Setup

Install dependencies:

```shell
npm install
```

Set up the database:

```shell
npm run setup
```

### Running the dev server

```shell
shopify app dev
```

Press `P` to open the app in your development store. Install the app to begin.

The CLI handles authentication, environment variables, and the tunnel automatically.

## Security

**Never commit `.env` files.** They contain your `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and session secrets. The `.gitignore` already excludes `.env`, but double-check before pushing.

## Deployment

Refer to the [Shopify deployment docs](https://shopify.dev/docs/apps/launch/deployment) for hosting options. Set `NODE_ENV=production` alongside your other environment variables when deploying.

## Tech stack

- [React Router](https://reactrouter.com/)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [Prisma](https://www.prisma.io/) (SQLite by default)
- [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql)
