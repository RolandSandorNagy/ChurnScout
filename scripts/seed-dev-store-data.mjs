#!/usr/bin/env node

/**
 * Development-only Shopify dev-store seeding tool for ChurnScout.
 * This script creates fake customers and fake historical orders in a Shopify
 * development store to support local/testing workflows.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEMO_TAG = "churnscout-demo-data";
const DEFAULT_CUSTOMER_COUNT = 24;
const MIN_CUSTOMER_COUNT = 1;
const RECOMMENDED_MIN_CUSTOMER_COUNT = 20;
const MAX_CUSTOMER_COUNT = 50;
const DEFAULT_CUSTOMER_DELAY_MS = 300;
const DEFAULT_ORDER_DELAY_MS = 12_500;
const DEFAULT_RETRY_COUNT = 3;

const CREATE_CUSTOMER_MUTATION = `
mutation SeedCustomerCreate($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer {
      id
      email
    }
    userErrors {
      field
      message
    }
  }
}
`;

const CREATE_ORDER_MUTATION = `
mutation SeedOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) {
    order {
      id
      name
      processedAt
    }
    userErrors {
      field
      message
    }
  }
}
`;

const ADD_TAGS_MUTATION = `
mutation SeedTagsAdd($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node {
      id
    }
    userErrors {
      field
      message
    }
  }
}
`;

const SHOP_CURRENCY_QUERY = `
query SeedShopCurrency {
  shop {
    currencyCode
    name
  }
}
`;

const PRODUCT_TITLE_POOL = [
  "Retention Rescue Bundle",
  "Lifecycle Booster Pack",
  "Winback Essentials Kit",
  "Customer Loyalty Add-on",
  "Revenue Recovery Guide",
  "Churn Monitor Subscription",
  "VIP Insights Report",
  "Store Growth Toolkit",
];

const PATTERN_DEFINITIONS = [
  {
    key: "new-customer",
    label: "New Customer",
    weight: 24,
    orderCountRange: [1, 1],
    lastOrderDaysRange: [1, 14],
    cadenceDaysRange: [7, 18],
    unitPriceRange: [18, 60],
  },
  {
    key: "repeat-customer",
    label: "Repeat Customer",
    weight: 24,
    orderCountRange: [2, 3],
    lastOrderDaysRange: [5, 45],
    cadenceDaysRange: [18, 45],
    unitPriceRange: [24, 85],
  },
  {
    key: "loyal-customer",
    label: "Loyal Customer",
    weight: 18,
    orderCountRange: [4, 6],
    lastOrderDaysRange: [4, 30],
    cadenceDaysRange: [16, 32],
    unitPriceRange: [35, 110],
  },
  {
    key: "vip-customer",
    label: "VIP Customer",
    weight: 10,
    orderCountRange: [6, 8],
    lastOrderDaysRange: [3, 25],
    cadenceDaysRange: [12, 28],
    unitPriceRange: [80, 260],
  },
  {
    key: "at-risk-customer",
    label: "At-Risk Customer",
    weight: 14,
    orderCountRange: [2, 4],
    lastOrderDaysRange: [75, 180],
    cadenceDaysRange: [20, 55],
    unitPriceRange: [28, 95],
  },
  {
    key: "lost-customer",
    label: "Lost Customer",
    weight: 10,
    orderCountRange: [2, 4],
    lastOrderDaysRange: [190, 420],
    cadenceDaysRange: [25, 70],
    unitPriceRange: [20, 80],
  },
];

function parseArgs(argv) {
  const args = {
    dryRun: false,
    customerCount: DEFAULT_CUSTOMER_COUNT,
    orderDelayMs: DEFAULT_ORDER_DELAY_MS,
    customerDelayMs: DEFAULT_CUSTOMER_DELAY_MS,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg.startsWith("--customers=")) {
      const value = Number.parseInt(arg.slice("--customers=".length), 10);
      if (!Number.isInteger(value)) {
        throw new Error("Invalid --customers value. Use an integer between 1 and 50.");
      }
      args.customerCount = value;
      continue;
    }

    if (arg.startsWith("--order-delay-ms=")) {
      const value = Number.parseInt(arg.slice("--order-delay-ms=".length), 10);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("Invalid --order-delay-ms value. Use an integer >= 0.");
      }
      args.orderDelayMs = value;
      continue;
    }

    if (arg.startsWith("--customer-delay-ms=")) {
      const value = Number.parseInt(arg.slice("--customer-delay-ms=".length), 10);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("Invalid --customer-delay-ms value. Use an integer >= 0.");
      }
      args.customerDelayMs = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.customerCount < MIN_CUSTOMER_COUNT || args.customerCount > MAX_CUSTOMER_COUNT) {
    throw new Error(`--customers must be between ${MIN_CUSTOMER_COUNT} and ${MAX_CUSTOMER_COUNT}.`);
  }

  return args;
}

function normalizeStoreDomain(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";
  const withoutProtocol = value.replace(/^https?:\/\//i, "");
  return withoutProtocol.replace(/\/.*$/, "");
}

function readDefaultApiVersionFromConfig() {
  const configPath = path.join(process.cwd(), "shopify.app.toml");
  try {
    const tomlText = fs.readFileSync(configPath, "utf8");
    const match = tomlText.match(/api_version\s*=\s*"([^"]+)"/);
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    // Best-effort only; we fall back below.
  }
  return "2026-07";
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function sample(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padCustomerIndex(index) {
  return String(index).padStart(3, "0");
}

function weightedPatternPick() {
  const totalWeight = PATTERN_DEFINITIONS.reduce((sum, pattern) => sum + pattern.weight, 0);
  let roll = randomFloat(0, totalWeight);

  for (const pattern of PATTERN_DEFINITIONS) {
    roll -= pattern.weight;
    if (roll <= 0) {
      return pattern;
    }
  }

  return PATTERN_DEFINITIONS[PATTERN_DEFINITIONS.length - 1];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildPatternSequence(customerCount) {
  const guaranteed = [...PATTERN_DEFINITIONS];
  const patterns = guaranteed.slice(0, Math.min(customerCount, guaranteed.length));

  while (patterns.length < customerCount) {
    patterns.push(weightedPatternPick());
  }

  return shuffle(patterns);
}

function daysAgoToIso(daysAgo) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

function buildOrderTimeline(pattern) {
  const orderCount = randomInt(pattern.orderCountRange[0], pattern.orderCountRange[1]);
  const lastOrderDaysAgo = randomInt(pattern.lastOrderDaysRange[0], pattern.lastOrderDaysRange[1]);

  const daysAgoPoints = [lastOrderDaysAgo];
  for (let i = 1; i < orderCount; i += 1) {
    const nextDaysAgo =
      daysAgoPoints[i - 1] + randomInt(pattern.cadenceDaysRange[0], pattern.cadenceDaysRange[1]);
    daysAgoPoints.push(nextDaysAgo);
  }

  return daysAgoPoints
    .map((daysAgo) => daysAgoToIso(daysAgo))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

function toMoneyAmount(value) {
  return Number.parseFloat(value.toFixed(2));
}

function buildFakeLineItems(pattern, currencyCode) {
  const lineCount = randomInt(1, 3);
  const lineItems = [];

  for (let i = 0; i < lineCount; i += 1) {
    const unitPrice = toMoneyAmount(randomFloat(pattern.unitPriceRange[0], pattern.unitPriceRange[1]));
    const quantity = randomInt(1, 3);
    lineItems.push({
      title: `${sample(PRODUCT_TITLE_POOL)} ${randomInt(1, 9)}`,
      quantity,
      priceSet: {
        shopMoney: {
          amount: unitPrice,
          currencyCode,
        },
      },
    });
  }

  return lineItems;
}

function computeOrderTotal(lineItems) {
  const total = lineItems.reduce((sum, item) => {
    return sum + item.priceSet.shopMoney.amount * item.quantity;
  }, 0);
  return toMoneyAmount(total);
}

function buildCustomerPlan(customerCount) {
  const patternSequence = buildPatternSequence(customerCount);

  return patternSequence.map((pattern, index) => {
    const numericId = index + 1;
    const paddedId = padCustomerIndex(numericId);
    const email = `churnscout-demo+${paddedId}@example.com`;
    return {
      demoId: paddedId,
      pattern,
      email,
      firstName: "ChurnScout",
      lastName: `Demo Customer ${paddedId}`,
      tags: [DEMO_TAG, `churnscout-${pattern.key}`],
      note: `Dev-only seed data generated by scripts/seed-dev-store-data.mjs`,
    };
  });
}

function summarizePlan(plan, currencyCode) {
  const patternCounts = new Map();
  let orderCount = 0;
  let projectedRevenue = 0;

  for (const customer of plan) {
    patternCounts.set(customer.pattern.key, (patternCounts.get(customer.pattern.key) ?? 0) + 1);
    orderCount += customer.orders.length;
    projectedRevenue += customer.orders.reduce((sum, order) => sum + order.total, 0);
  }

  console.log(`Customers planned: ${plan.length}`);
  console.log(`Orders planned: ${orderCount}`);
  console.log(`Projected gross total: ${toMoneyAmount(projectedRevenue)} ${currencyCode}`);
  console.log("Pattern distribution:");

  for (const pattern of PATTERN_DEFINITIONS) {
    const count = patternCounts.get(pattern.key) ?? 0;
    console.log(`  - ${pattern.label}: ${count}`);
  }
}

function formatUserErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "Unknown user error from Shopify.";
  }

  return errors
    .map((error) => {
      const fieldPath = Array.isArray(error.field) ? error.field.join(".") : "";
      return fieldPath ? `${fieldPath}: ${error.message}` : error.message;
    })
    .join("; ");
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildTokenTroubleshootingMessage(prefix) {
  return `${prefix}
Troubleshooting checklist:
- Verify the seed app is installed on this development store.
- Verify the seed app and development store are in the same Shopify Dev Dashboard organization.
- Verify SHOPIFY_SEED_CLIENT_ID and SHOPIFY_SEED_CLIENT_SECRET are correct.
- Verify the app has write_customers and write_orders Admin API scopes.`;
}

async function exchangeClientCredentialsToken(storeDomain, clientId, clientSecret) {
  const endpoint = `https://${storeDomain}/admin/oauth/access_token`;
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch (error) {
    throw new Error(
      buildTokenTroubleshootingMessage(
        `Token exchange request failed at ${endpoint}: ${error instanceof Error ? error.message : String(error)}\n`,
      ),
    );
  }

  const payload = await safeJson(response);
  if (!response.ok) {
    const details = payload ? JSON.stringify(payload) : "<non-JSON response>";
    throw new Error(
      buildTokenTroubleshootingMessage(
        `Token exchange failed with HTTP ${response.status}: ${details}\n`,
      ),
    );
  }

  const accessToken = payload?.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error(
      buildTokenTroubleshootingMessage(
        "Token exchange succeeded but no access_token was returned.\n",
      ),
    );
  }

  return accessToken;
}

async function resolveAccessToken({ dryRun, storeDomain }) {
  const adminAccessToken = (process.env.SHOPIFY_SEED_ADMIN_ACCESS_TOKEN || "").trim();
  const clientId = (process.env.SHOPIFY_SEED_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SHOPIFY_SEED_CLIENT_SECRET || "").trim();

  if (dryRun) {
    if (adminAccessToken) {
      return {
        mode: "legacy admin token provided (unused in dry-run)",
        accessToken: "",
      };
    }
    if (clientId && clientSecret) {
      return {
        mode: "client credentials provided (unused in dry-run)",
        accessToken: "",
      };
    }
    return {
      mode: "dry-run without credentials",
      accessToken: "",
    };
  }

  if (adminAccessToken) {
    return {
      mode: "legacy admin access token (SHOPIFY_SEED_ADMIN_ACCESS_TOKEN)",
      accessToken: adminAccessToken,
    };
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing authentication credentials. Provide SHOPIFY_SEED_ADMIN_ACCESS_TOKEN, or provide both SHOPIFY_SEED_CLIENT_ID and SHOPIFY_SEED_CLIENT_SECRET.",
    );
  }

  const accessToken = await exchangeClientCredentialsToken(storeDomain, clientId, clientSecret);
  return {
    mode: "client credentials grant (SHOPIFY_SEED_CLIENT_ID + SHOPIFY_SEED_CLIENT_SECRET)",
    accessToken,
  };
}

async function graphQLRequest(client, query, variables) {
  let lastError = null;

  for (let attempt = 1; attempt <= DEFAULT_RETRY_COUNT; attempt += 1) {
    const response = await fetch(client.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": client.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429 && attempt < DEFAULT_RETRY_COUNT) {
      const retryAfterSeconds = Number.parseInt(response.headers.get("Retry-After") ?? "0", 10);
      const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 3000 * attempt;
      console.warn(`Rate limited by Shopify (HTTP 429). Waiting ${waitMs}ms before retry ${attempt + 1}...`);
      await wait(waitMs);
      continue;
    }

    const payload = await safeJson(response);

    if (!response.ok) {
      const bodyText = payload ? JSON.stringify(payload) : "<non-JSON response>";
      const message = `Shopify GraphQL HTTP ${response.status}: ${bodyText}`;
      if (attempt < DEFAULT_RETRY_COUNT) {
        const waitMs = 1000 * attempt;
        console.warn(`${message}. Retrying in ${waitMs}ms...`);
        await wait(waitMs);
        lastError = new Error(message);
        continue;
      }
      throw new Error(message);
    }

    if (payload?.errors?.length) {
      throw new Error(
        `Shopify GraphQL operation failed: ${payload.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join("; ")}`,
      );
    }

    return payload?.data ?? {};
  }

  throw lastError ?? new Error("GraphQL request failed after retries.");
}

async function addTags(client, id, tags) {
  const data = await graphQLRequest(client, ADD_TAGS_MUTATION, { id, tags });
  const result = data.tagsAdd;
  if (!result) {
    throw new Error("Missing tagsAdd response.");
  }
  if (result.userErrors?.length) {
    throw new Error(formatUserErrors(result.userErrors));
  }
}

async function createCustomer(client, customerInput) {
  const data = await graphQLRequest(client, CREATE_CUSTOMER_MUTATION, {
    input: {
      email: customerInput.email,
      firstName: customerInput.firstName,
      lastName: customerInput.lastName,
      note: customerInput.note,
    },
  });

  const result = data.customerCreate;
  if (!result) {
    throw new Error("Missing customerCreate response.");
  }
  if (result.userErrors?.length) {
    throw new Error(formatUserErrors(result.userErrors));
  }
  if (!result.customer?.id) {
    throw new Error("Shopify did not return a created customer id.");
  }

  return result.customer;
}

async function createOrder(client, orderInput) {
  const data = await graphQLRequest(client, CREATE_ORDER_MUTATION, {
    order: orderInput,
    options: {
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    },
  });

  const result = data.orderCreate;
  if (!result) {
    throw new Error("Missing orderCreate response.");
  }
  if (result.userErrors?.length) {
    throw new Error(formatUserErrors(result.userErrors));
  }
  if (!result.order?.id) {
    throw new Error("Shopify did not return a created order id.");
  }

  return result.order;
}

async function getShopContext(client) {
  const data = await graphQLRequest(client, SHOP_CURRENCY_QUERY, {});
  const currencyCode = data?.shop?.currencyCode;
  const shopName = data?.shop?.name;

  if (!currencyCode) {
    throw new Error("Could not resolve store currency from Shopify.");
  }

  return { currencyCode, shopName: shopName ?? "Unknown shop" };
}

function buildOrdersForCustomer(customer, currencyCode) {
  const timeline = buildOrderTimeline(customer.pattern);
  return timeline.map((processedAt) => {
    const lineItems = buildFakeLineItems(customer.pattern, currencyCode);
    return {
      processedAt,
      lineItems,
      total: computeOrderTotal(lineItems),
    };
  });
}

function estimateOrderDurationMinutes(orderCount, orderDelayMs) {
  const ms = orderCount * orderDelayMs;
  return (ms / 1000 / 60).toFixed(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const defaultApiVersion = readDefaultApiVersionFromConfig();
  const apiVersion = (process.env.SHOPIFY_SEED_API_VERSION || defaultApiVersion).trim();
  const storeDomain = normalizeStoreDomain(process.env.SHOPIFY_SEED_STORE_DOMAIN);

  if (!apiVersion) {
    throw new Error("SHOPIFY_SEED_API_VERSION resolved to an empty value.");
  }

  if (!storeDomain && !args.dryRun) {
    throw new Error("SHOPIFY_SEED_STORE_DOMAIN is required unless --dry-run is used.");
  }

  if (args.customerCount < RECOMMENDED_MIN_CUSTOMER_COUNT) {
    console.warn(
      `Warning: --customers=${args.customerCount} is below the recommended ${RECOMMENDED_MIN_CUSTOMER_COUNT}+ for realistic churn testing.`,
    );
  }

  const auth = await resolveAccessToken({ dryRun: args.dryRun, storeDomain });

  console.log("ChurnScout Shopify Dev Seeder");
  console.log("--------------------------------");
  console.log(`Mode: ${args.dryRun ? "DRY RUN (no API calls)" : "LIVE RUN (will create data in Shopify dev store)"}`);
  console.log(`Customers: ${args.customerCount}`);
  console.log(`API Version: ${apiVersion}`);
  console.log(`Store domain: ${storeDomain || "(not required in dry-run)"}`);
  console.log(`Auth mode: ${auth.mode}`);
  console.log(`Order delay: ${args.orderDelayMs}ms`);

  const client = {
    endpoint: storeDomain ? `https://${storeDomain}/admin/api/${apiVersion}/graphql.json` : "",
    accessToken: auth.accessToken,
  };

  let currencyCode = "USD";
  let shopName = "Dry Run Shop";
  if (!args.dryRun) {
    const shopContext = await getShopContext(client);
    currencyCode = shopContext.currencyCode;
    shopName = shopContext.shopName;
  }

  const customerPlan = buildCustomerPlan(args.customerCount).map((customer) => {
    return {
      ...customer,
      orders: buildOrdersForCustomer(customer, currencyCode),
    };
  });

  const totalOrderCount = customerPlan.reduce((sum, customer) => sum + customer.orders.length, 0);

  console.log(`Resolved shop: ${shopName}`);
  summarizePlan(customerPlan, currencyCode);
  console.log(
    `Estimated order-creation pacing time: ~${estimateOrderDurationMinutes(totalOrderCount, args.orderDelayMs)} minutes`,
  );

  if (args.dryRun) {
    console.log("");
    console.log("Dry-run preview (first 5 customers):");

    for (const customer of customerPlan.slice(0, 5)) {
      const orderSummary = customer.orders
        .map((order) => `${order.processedAt.slice(0, 10)} (${order.total} ${currencyCode})`)
        .join(", ");
      console.log(
        `- ${customer.email} | pattern=${customer.pattern.key} | orders=${customer.orders.length} | ${orderSummary}`,
      );
    }

    console.log("");
    console.log("Dry-run complete. No Shopify data was created.");
    return;
  }

  let createdCustomers = 0;
  let createdOrders = 0;

  console.log("");
  console.log("Starting live seeding...");
  console.log(
    "Note: Shopify development/trial stores limit orderCreate to 5 orders per minute, so this script intentionally paces order creation.",
  );

  for (const customer of customerPlan) {
    console.log("");
    console.log(`[Customer ${customer.demoId}] Creating ${customer.email} (${customer.pattern.label})...`);

    const createdCustomer = await createCustomer(client, customer);
    createdCustomers += 1;
    console.log(`  Created customer id: ${createdCustomer.id}`);

    await addTags(client, createdCustomer.id, customer.tags);
    console.log(`  Added tags: ${customer.tags.join(", ")}`);

    await wait(args.customerDelayMs);

    let customerOrderCounter = 0;
    for (const plannedOrder of customer.orders) {
      customerOrderCounter += 1;
      console.log(
        `  [Order ${customerOrderCounter}/${customer.orders.length}] processedAt=${plannedOrder.processedAt} total=${plannedOrder.total} ${currencyCode}`,
      );

      const createdOrder = await createOrder(client, {
        customer: {
          toAssociate: {
            id: createdCustomer.id,
          },
        },
        email: customer.email,
        processedAt: plannedOrder.processedAt,
        tags: customer.tags,
        test: true,
        note: `Dev-only seed data generated by scripts/seed-dev-store-data.mjs`,
        lineItems: plannedOrder.lineItems,
      });

      createdOrders += 1;
      console.log(`    Created order id: ${createdOrder.id} (${createdOrder.name ?? "no order name"})`);

      await wait(args.orderDelayMs);
    }
  }

  console.log("");
  console.log("Seeding complete.");
  console.log(`Customers created: ${createdCustomers}`);
  console.log(`Orders created: ${createdOrders}`);
  console.log(`Tag used: ${DEMO_TAG}`);
}

main().catch((error) => {
  console.error("");
  console.error("Seeding failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
