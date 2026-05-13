#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const API_VERSION = "2026-04";
const ORDER_CREATE_INTERVAL_MS = 12_100; // Shopify dev stores: max 5 orderCreate per minute.
const BASE_TAGS = ["mock-seed", "app-demo", "generated-test-data"];
const MAX_GRAPHQL_ATTEMPTS = 6;
const MAX_MUTATION_USER_ERROR_ATTEMPTS = 3;

const FIRST_NAMES = [
  "Avery",
  "Jordan",
  "Morgan",
  "Taylor",
  "Riley",
  "Casey",
  "Parker",
  "Cameron",
  "Elliot",
  "Blake",
  "Quinn",
  "Hayden",
  "Reese",
  "Skyler",
  "Drew",
  "Harper",
  "Finley",
  "Emerson",
  "Rowan",
  "Sage",
];

const LAST_NAMES = [
  "Carter",
  "Brooks",
  "Reed",
  "Bennett",
  "Foster",
  "Hayes",
  "Perry",
  "Coleman",
  "Morris",
  "Jenkins",
  "Sullivan",
  "Parker",
  "Turner",
  "Murphy",
  "Powell",
  "Long",
  "Fisher",
  "Myers",
  "Rogers",
  "Price",
];

const STREET_NAMES = [
  "Maple",
  "Cedar",
  "Oak",
  "Pine",
  "Elm",
  "River",
  "Lake",
  "Hill",
  "Valley",
  "Sunset",
  "Highland",
  "Willow",
  "Birch",
  "Park",
  "Meadow",
];

const STREET_SUFFIXES = ["St", "Ave", "Rd", "Ln", "Dr", "Blvd", "Way", "Ct"];

const US_LOCATIONS = [
  { city: "Austin", provinceCode: "TX", zipPrefix: "78" },
  { city: "Seattle", provinceCode: "WA", zipPrefix: "98" },
  { city: "Denver", provinceCode: "CO", zipPrefix: "80" },
  { city: "Nashville", provinceCode: "TN", zipPrefix: "37" },
  { city: "Phoenix", provinceCode: "AZ", zipPrefix: "85" },
  { city: "Columbus", provinceCode: "OH", zipPrefix: "43" },
  { city: "Miami", provinceCode: "FL", zipPrefix: "33" },
  { city: "Portland", provinceCode: "OR", zipPrefix: "97" },
  { city: "Raleigh", provinceCode: "NC", zipPrefix: "27" },
  { city: "Madison", provinceCode: "WI", zipPrefix: "53" },
];

const SHOP_INFO_QUERY = `
  query SeedShopInfo {
    shop {
      id
      name
      myshopifyDomain
      plan {
        displayName
        partnerDevelopment
      }
    }
  }
`;

const SHOP_INFO_QUERY_FALLBACK = `
  query SeedShopInfoFallback {
    shop {
      id
      name
      myshopifyDomain
      plan {
        displayName
      }
    }
  }
`;

const PRODUCT_VARIANTS_QUERY = `
  query SeedProductVariants($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          sku
          product {
            id
            title
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CUSTOMER_CREATE_MUTATION = `
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

const ORDER_CREATE_MUTATION = `
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

class ShopifyGraphQLError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ShopifyGraphQLError";
    this.details = details;
  }
}

class OrderCreatePacer {
  constructor(intervalMs) {
    this.intervalMs = intervalMs;
    this.nextAllowedAt = 0;
  }

  async waitForSlot() {
    const now = Date.now();
    const waitMs = this.nextAllowedAt - now;
    if (waitMs > 0) {
      log("rate-limit", `Waiting ${waitMs}ms for next orderCreate slot...`);
      await sleep(waitMs);
    }
  }

  markRequest() {
    this.nextAllowedAt = Date.now() + this.intervalMs;
  }
}

function log(scope, message) {
  console.log(`[${new Date().toISOString()}] [${scope}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function hasArg(flag) {
  return process.argv.slice(2).includes(flag);
}

function parseIntEnv(name, defaultValue, min) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    throw new Error(`Invalid ${name}: expected integer >= ${min}, got '${raw}'.`);
  }

  return parsed;
}

function parseOptionalIntEnv(name, min) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    throw new Error(`Invalid ${name}: expected integer >= ${min}, got '${raw}'.`);
  }

  return parsed;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function normalizeShopDomain(input) {
  const withoutProtocol = input.replace(/^https?:\/\//i, "").trim();
  return withoutProtocol.replace(/\/$/, "").toLowerCase();
}

function parseDateOnlyUtc(name, value) {
  const trimmed = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid ${name}: expected YYYY-MM-DD, got '${value}'.`);
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!valid) {
    throw new Error(`Invalid ${name}: '${value}' is not a real calendar date.`);
  }

  return date;
}

function resolveOrderDateWindow(orderDateStartRaw, orderDateEndRaw) {
  const hasStart = Boolean(orderDateStartRaw && String(orderDateStartRaw).trim());
  const hasEnd = Boolean(orderDateEndRaw && String(orderDateEndRaw).trim());

  if (hasStart !== hasEnd) {
    throw new Error("ORDER_DATE_START and ORDER_DATE_END must be provided together.");
  }

  if (hasStart && hasEnd) {
    const startDate = parseDateOnlyUtc("ORDER_DATE_START", orderDateStartRaw);
    const endDate = parseDateOnlyUtc("ORDER_DATE_END", orderDateEndRaw);
    const endOfDay = new Date(Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
      23,
      59,
      59,
      999,
    ));

    if (startDate.getTime() > endOfDay.getTime()) {
      throw new Error("Invalid date window: ORDER_DATE_START must be <= ORDER_DATE_END.");
    }

    return {
      mode: "custom",
      start: startDate,
      end: endOfDay,
    };
  }

  const end = new Date();
  const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  return {
    mode: "last12Months",
    start,
    end,
  };
}

function createRunId() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 8);
  return `seed-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${random}`;
}

function escapeForTag(value) {
  return value.replace(/[^a-zA-Z0-9-_:.]/g, "-");
}

function calculateBackoffMs(attempt) {
  const base = 1_000;
  const max = 30_000;
  const exponential = Math.min(max, base * 2 ** (attempt - 1));
  const jitter = randomInt(0, 600);
  return exponential + jitter;
}

function stringifyUserErrors(userErrors) {
  return userErrors
    .map((error) => {
      const field = Array.isArray(error.field) ? error.field.join(".") : "unknown";
      return `${field}: ${error.message}`;
    })
    .join(" | ");
}

function isRetryableGraphQLError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.extensions?.code || "").toUpperCase();

  return (
    code === "THROTTLED" ||
    code === "INTERNAL_SERVER_ERROR" ||
    message.includes("throttled") ||
    message.includes("rate limit") ||
    message.includes("timed out") ||
    message.includes("try again") ||
    message.includes("temporar")
  );
}

function isRetryableUserError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("thrott") ||
    message.includes("rate limit") ||
    message.includes("try again") ||
    message.includes("temporar") ||
    message.includes("internal") ||
    message.includes("timeout")
  );
}

function shouldRetryFromUserErrors(userErrors) {
  return userErrors.some(isRetryableUserError);
}

function errorMentionsAddressRestriction(userErrors) {
  return userErrors.some((error) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("not approved to use") && message.includes("address");
  });
}

function containsUnknownFieldError(graphQLErrors, fieldName) {
  return graphQLErrors.some((error) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("field") && message.includes(fieldName.toLowerCase()) && message.includes("defined");
  });
}

function summarizeGraphQLErrors(errors) {
  return errors
    .map((error) => {
      const code = error?.extensions?.code ? `${error.extensions.code}: ` : "";
      return `${code}${error.message}`;
    })
    .join(" | ");
}

async function callShopifyGraphQL({ endpoint, token, query, variables, operationName, maxAttempts = MAX_GRAPHQL_ATTEMPTS }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
      });

      const body = await response.json().catch(() => {
        throw new ShopifyGraphQLError("Shopify returned a non-JSON response", { status: response.status });
      });

      if (!response.ok) {
        const statusMessage = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
        const retryable = response.status === 429 || response.status >= 500;

        if (retryable && attempt < maxAttempts) {
          const delayMs = calculateBackoffMs(attempt);
          log(operationName || "graphql", `${statusMessage}; retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
          await sleep(delayMs);
          continue;
        }

        throw new ShopifyGraphQLError(`Shopify request failed (${statusMessage})`, {
          status: response.status,
          body,
        });
      }

      if (Array.isArray(body?.errors) && body.errors.length > 0) {
        const retryable = body.errors.some(isRetryableGraphQLError);

        if (retryable && attempt < maxAttempts) {
          const delayMs = calculateBackoffMs(attempt);
          log(
            operationName || "graphql",
            `GraphQL errors (${summarizeGraphQLErrors(body.errors)}); retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`,
          );
          await sleep(delayMs);
          continue;
        }

        throw new ShopifyGraphQLError(`GraphQL errors: ${summarizeGraphQLErrors(body.errors)}`, {
          graphQLErrors: body.errors,
          data: body.data,
        });
      }

      return body.data;
    } catch (error) {
      if (error instanceof ShopifyGraphQLError) {
        throw error;
      }

      if (attempt < maxAttempts) {
        const delayMs = calculateBackoffMs(attempt);
        log(operationName || "graphql", `Network error: ${error.message}; retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
        await sleep(delayMs);
        continue;
      }

      throw new ShopifyGraphQLError(`Network error after retries: ${error.message}`);
    }
  }

  throw new ShopifyGraphQLError("Unexpected GraphQL retry loop exit");
}

async function getShopInfo(endpoint, token) {
  try {
    const data = await callShopifyGraphQL({
      endpoint,
      token,
      query: SHOP_INFO_QUERY,
      operationName: "shop-info",
    });

    return {
      ...data.shop,
      plan: {
        ...data.shop.plan,
      },
    };
  } catch (error) {
    if (
      error instanceof ShopifyGraphQLError &&
      Array.isArray(error.details?.graphQLErrors) &&
      containsUnknownFieldError(error.details.graphQLErrors, "partnerDevelopment")
    ) {
      log("shop-info", "Falling back to plan.displayName only (partnerDevelopment unavailable on this API version).");
      const fallbackData = await callShopifyGraphQL({
        endpoint,
        token,
        query: SHOP_INFO_QUERY_FALLBACK,
        operationName: "shop-info-fallback",
      });

      return {
        ...fallbackData.shop,
        plan: {
          ...fallbackData.shop.plan,
          partnerDevelopment: null,
        },
      };
    }

    throw error;
  }
}

function ensureDevelopmentStore(shopInfo) {
  if (shopInfo?.plan?.partnerDevelopment === true) {
    return;
  }

  const displayName = String(shopInfo?.plan?.displayName || "").toLowerCase();
  const looksLikeDevelopment =
    displayName.includes("development") || displayName.includes("dev") || displayName.includes("trial") || displayName.includes("partner");

  if (!looksLikeDevelopment) {
    throw new Error(
      `Safety check failed: refusing to seed non-development store (plan: '${shopInfo?.plan?.displayName || "unknown"}').`,
    );
  }
}

async function fetchAllVariants(endpoint, token) {
  const variants = [];
  let after = null;

  while (true) {
    const data = await callShopifyGraphQL({
      endpoint,
      token,
      query: PRODUCT_VARIANTS_QUERY,
      variables: { first: 250, after },
      operationName: "variants",
    });

    const connection = data?.productVariants;
    if (!connection) {
      throw new Error("productVariants query returned no connection payload.");
    }

    for (const edge of connection.edges) {
      variants.push(edge.node);
    }

    if (!connection.pageInfo.hasNextPage) {
      break;
    }

    after = connection.pageInfo.endCursor;
  }

  return variants;
}

function generatePhone(index) {
  const line = String((1000 + (index % 9000))).padStart(4, "0");
  const middle = String(200 + (index % 700)).padStart(3, "0");
  return `+1${555}${middle}${line}`;
}

function generateAddress(index, firstName, lastName) {
  const location = US_LOCATIONS[index % US_LOCATIONS.length];
  const streetNumber = randomInt(100, 9999);
  const street = pickRandom(STREET_NAMES);
  const suffix = pickRandom(STREET_SUFFIXES);
  const zipTail = String(randomInt(0, 999)).padStart(3, "0");

  return {
    firstName,
    lastName,
    address1: `${streetNumber} ${street} ${suffix}`,
    city: location.city,
    provinceCode: location.provinceCode,
    countryCode: "US",
    zip: `${location.zipPrefix}${zipTail}`,
    phone: generatePhone(index),
  };
}

function generateCustomerProfile(index, runId) {
  const firstName = pickRandom(FIRST_NAMES);
  const lastName = pickRandom(LAST_NAMES);
  const sequence = String(index + 1).padStart(4, "0");
  const localPart = `${firstName}.${lastName}.${runId}.${sequence}`.toLowerCase().replace(/[^a-z0-9.]/g, "");
  const email = `${localPart}@example.com`;
  const phone = generatePhone(index);
  const address = generateAddress(index, firstName, lastName);

  return {
    firstName,
    lastName,
    email,
    phone,
    address,
  };
}

function chooseOrderSegment() {
  const roll = Math.random();
  if (roll < 0.35) return "occasional";
  if (roll < 0.8) return "regular";
  return "frequent";
}

function segmentWeight(segment) {
  if (segment === "occasional") return 1;
  if (segment === "regular") return 2;
  return 3;
}

function pickWeightedIndex(indices, weights) {
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) {
    return indices[Math.floor(Math.random() * indices.length)];
  }

  let threshold = Math.random() * totalWeight;
  for (let i = 0; i < indices.length; i += 1) {
    threshold -= weights[i];
    if (threshold <= 0) {
      return indices[i];
    }
  }

  return indices[indices.length - 1];
}

function determineOrderCount(minOrders, maxOrders, segment) {
  if (minOrders === maxOrders) {
    return minOrders;
  }

  const span = maxOrders - minOrders;

  if (segment === "occasional") {
    return Math.min(maxOrders, minOrders + randomInt(0, Math.min(1, span)));
  }

  if (segment === "frequent") {
    return Math.max(minOrders, maxOrders - randomInt(0, Math.min(2, span)));
  }

  const triangular = Math.floor(((Math.random() + Math.random()) / 2) * (span + 1));
  return Math.min(maxOrders, minOrders + triangular);
}

function determineOrderCountsPerCustomer({ customerCount, minOrdersPerCustomer, maxOrdersPerCustomer, totalOrderCount, segments }) {
  if (totalOrderCount == null) {
    return segments.map((segment) => determineOrderCount(minOrdersPerCustomer, maxOrdersPerCustomer, segment));
  }

  const minTotal = customerCount * minOrdersPerCustomer;
  const maxTotal = customerCount * maxOrdersPerCustomer;
  if (totalOrderCount < minTotal || totalOrderCount > maxTotal) {
    throw new Error(
      `TOTAL_ORDER_COUNT=${totalOrderCount} is out of bounds for CUSTOMER_COUNT=${customerCount} and min/max per customer (${minOrdersPerCustomer}-${maxOrdersPerCustomer}). Valid range: ${minTotal}-${maxTotal}.`,
    );
  }

  const counts = Array.from({ length: customerCount }, () => minOrdersPerCustomer);
  let remaining = totalOrderCount - minTotal;

  while (remaining > 0) {
    const eligible = [];
    const weights = [];

    for (let index = 0; index < customerCount; index += 1) {
      if (counts[index] < maxOrdersPerCustomer) {
        eligible.push(index);
        weights.push(segmentWeight(segments[index]));
      }
    }

    if (eligible.length === 0) {
      throw new Error("Internal distribution error: no eligible customers left while orders remain.");
    }

    const selectedIndex = pickWeightedIndex(eligible, weights);
    counts[selectedIndex] += 1;
    remaining -= 1;
  }

  return counts;
}

function generateOrderDates(orderCount, segment, dateWindow) {
  const startMs = dateWindow.start.getTime();
  const endMs = dateWindow.end.getTime();
  const spanMs = Math.max(0, endMs - startMs);
  const exponentBySegment = {
    occasional: 0.35,
    regular: 0.8,
    frequent: 1.25,
  };

  const exponent = exponentBySegment[segment] ?? 0.8;
  const dates = [];

  for (let i = 0; i < orderCount; i += 1) {
    const r = Math.pow(Math.random(), exponent);
    const timestamp = endMs - r * spanMs;
    dates.push(new Date(timestamp));
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

function pickLineItems(variants) {
  const lineItemCount = randomInt(1, Math.min(3, variants.length));
  const selected = shuffle(variants).slice(0, lineItemCount);

  return selected.map((variant) => ({
    variantId: variant.id,
    quantity: randomInt(1, 4),
  }));
}

function buildCustomerInput(profile, tags, runId, includeAddresses) {
  const input = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    tags,
    note: `Mock customer generated by ${runId}`,
  };

  if (includeAddresses) {
    input.addresses = [profile.address];
  }

  return input;
}

function buildOrderInput({ customerId, profile, tags, runId, variants, processedAt, customerMode, includeAddresses }) {
  const orderInput = {
    lineItems: pickLineItems(variants),
    email: profile.email,
    phone: profile.phone,
    processedAt,
    tags,
    note: `Mock order generated by ${runId}`,
    test: true,
    financialStatus: "PENDING",
  };

  if (customerMode === "customer") {
    orderInput.customer = {
      toAssociate: {
        id: customerId,
      },
    };
  } else {
    orderInput.customerId = customerId;
  }

  if (includeAddresses) {
    orderInput.shippingAddress = profile.address;
    orderInput.billingAddress = profile.address;
  }

  return orderInput;
}

async function createCustomerWithRetry({ endpoint, token, profile, tags, runId, runtimeFlags, customerProgressLabel }) {
  for (let attempt = 1; attempt <= MAX_MUTATION_USER_ERROR_ATTEMPTS; attempt += 1) {
    try {
      const input = buildCustomerInput(profile, tags, runId, runtimeFlags.includeCustomerAddresses);

      const data = await callShopifyGraphQL({
        endpoint,
        token,
        query: CUSTOMER_CREATE_MUTATION,
        variables: { input },
        operationName: "customerCreate",
      });

      const payload = data?.customerCreate;
      if (!payload) {
        throw new Error("customerCreate returned empty payload.");
      }

      const userErrors = payload.userErrors || [];
      if (userErrors.length === 0 && payload.customer?.id) {
        return payload.customer;
      }

      if (runtimeFlags.includeCustomerAddresses && errorMentionsAddressRestriction(userErrors)) {
        runtimeFlags.includeCustomerAddresses = false;
        log("customer", `${customerProgressLabel} address fields rejected by API permissions; retrying without customer.addresses.`);
        continue;
      }

      if (shouldRetryFromUserErrors(userErrors) && attempt < MAX_MUTATION_USER_ERROR_ATTEMPTS) {
        const delayMs = calculateBackoffMs(attempt);
        log(
          "customer",
          `${customerProgressLabel} userErrors (${stringifyUserErrors(userErrors)}); retrying in ${delayMs}ms (attempt ${attempt}/${MAX_MUTATION_USER_ERROR_ATTEMPTS})`,
        );
        await sleep(delayMs);
        continue;
      }

      throw new Error(`customerCreate userErrors: ${stringifyUserErrors(userErrors)}`);
    } catch (error) {
      if (
        error instanceof ShopifyGraphQLError &&
        runtimeFlags.includeCustomerAddresses &&
        Array.isArray(error.details?.graphQLErrors) &&
        containsUnknownFieldError(error.details.graphQLErrors, "addresses")
      ) {
        runtimeFlags.includeCustomerAddresses = false;
        log("customer", `${customerProgressLabel} addresses field unavailable; retrying without customer.addresses.`);
        continue;
      }

      if (attempt < MAX_MUTATION_USER_ERROR_ATTEMPTS) {
        const delayMs = calculateBackoffMs(attempt);
        log("customer", `${customerProgressLabel} failed (${error.message}); retrying in ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to create customer after retries.");
}

async function createOrderWithRetry({
  endpoint,
  token,
  customerId,
  profile,
  tags,
  runId,
  variants,
  processedAt,
  runtimeFlags,
  orderPacer,
  orderProgressLabel,
}) {
  for (let attempt = 1; attempt <= MAX_MUTATION_USER_ERROR_ATTEMPTS; attempt += 1) {
    try {
      await orderPacer.waitForSlot();
      orderPacer.markRequest();

      const order = buildOrderInput({
        customerId,
        profile,
        tags,
        runId,
        variants,
        processedAt,
        customerMode: runtimeFlags.orderCustomerMode,
        includeAddresses: runtimeFlags.includeOrderAddresses,
      });

      const data = await callShopifyGraphQL({
        endpoint,
        token,
        query: ORDER_CREATE_MUTATION,
        variables: {
          order,
          options: {
            sendReceipt: false,
            sendFulfillmentReceipt: false,
          },
        },
        operationName: "orderCreate",
      });

      const payload = data?.orderCreate;
      if (!payload) {
        throw new Error("orderCreate returned empty payload.");
      }

      const userErrors = payload.userErrors || [];
      if (userErrors.length === 0 && payload.order?.id) {
        return payload.order;
      }

      if (runtimeFlags.includeOrderAddresses && errorMentionsAddressRestriction(userErrors)) {
        runtimeFlags.includeOrderAddresses = false;
        log("order", `${orderProgressLabel} address fields rejected by API permissions; retrying without order addresses.`);
        continue;
      }

      if (shouldRetryFromUserErrors(userErrors) && attempt < MAX_MUTATION_USER_ERROR_ATTEMPTS) {
        const delayMs = calculateBackoffMs(attempt);
        log(
          "order",
          `${orderProgressLabel} userErrors (${stringifyUserErrors(userErrors)}); retrying in ${delayMs}ms (attempt ${attempt}/${MAX_MUTATION_USER_ERROR_ATTEMPTS})`,
        );
        await sleep(delayMs);
        continue;
      }

      throw new Error(`orderCreate userErrors: ${stringifyUserErrors(userErrors)}`);
    } catch (error) {
      if (
        error instanceof ShopifyGraphQLError &&
        Array.isArray(error.details?.graphQLErrors) &&
        runtimeFlags.orderCustomerMode === "customer" &&
        containsUnknownFieldError(error.details.graphQLErrors, "customer")
      ) {
        runtimeFlags.orderCustomerMode = "customerId";
        log("order", `${orderProgressLabel} 'customer' input field unavailable; retrying with deprecated customerId.`);
        continue;
      }

      if (
        error instanceof ShopifyGraphQLError &&
        runtimeFlags.includeOrderAddresses &&
        Array.isArray(error.details?.graphQLErrors) &&
        (containsUnknownFieldError(error.details.graphQLErrors, "shippingAddress") ||
          containsUnknownFieldError(error.details.graphQLErrors, "billingAddress"))
      ) {
        runtimeFlags.includeOrderAddresses = false;
        log("order", `${orderProgressLabel} address input fields unavailable; retrying without addresses.`);
        continue;
      }

      if (attempt < MAX_MUTATION_USER_ERROR_ATTEMPTS) {
        const delayMs = calculateBackoffMs(attempt);
        log("order", `${orderProgressLabel} failed (${error.message}); retrying in ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to create order after retries.");
}

function buildConfigFromEnv() {
  const dryRun = parseBoolean(process.env.DRY_RUN, false) || hasArg("--dry-run");
  const allowDevSeed = parseBoolean(process.env.ALLOW_DEV_SEED, false);
  const shopDomain = normalizeShopDomain(requireEnv("SHOPIFY_SHOP_DOMAIN"));
  const seedTargetShopDomain = (process.env.SEED_TARGET_SHOP_DOMAIN || "").trim()
    ? normalizeShopDomain(process.env.SEED_TARGET_SHOP_DOMAIN || "")
    : null;
  const adminToken = dryRun ? (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim() : requireEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const customerCount = parseIntEnv("CUSTOMER_COUNT", 25, 1);
  const minOrdersPerCustomer = parseIntEnv("MIN_ORDERS_PER_CUSTOMER", 1, 0);
  const maxOrdersPerCustomer = parseIntEnv("MAX_ORDERS_PER_CUSTOMER", 4, 0);
  const totalOrderCount = parseOptionalIntEnv("TOTAL_ORDER_COUNT", 0);
  const orderDateStart = process.env.ORDER_DATE_START || "";
  const orderDateEnd = process.env.ORDER_DATE_END || "";
  const orderDateWindow = resolveOrderDateWindow(orderDateStart, orderDateEnd);

  if (minOrdersPerCustomer > maxOrdersPerCustomer) {
    throw new Error("MIN_ORDERS_PER_CUSTOMER must be <= MAX_ORDERS_PER_CUSTOMER.");
  }

  return {
    shopDomain,
    seedTargetShopDomain,
    adminToken,
    customerCount,
    minOrdersPerCustomer,
    maxOrdersPerCustomer,
    totalOrderCount,
    orderDateWindow,
    allowDevSeed,
    dryRun,
  };
}

async function ensureOutputDirectory() {
  const outputDir = path.resolve(process.cwd(), "seed-output");
  await fs.mkdir(outputDir, { recursive: true });
  return outputDir;
}

async function main() {
  const config = buildConfigFromEnv();
  const endpoint = `https://${config.shopDomain}/admin/api/${API_VERSION}/graphql.json`;
  const runId = createRunId();
  const runTag = `seed-run:${escapeForTag(runId)}`;
  const tags = [...BASE_TAGS, runTag];

  const outputDir = await ensureOutputDirectory();
  const outputPath = path.join(outputDir, `${runId}.json`);

  log("startup", `Seed run ID: ${runId}`);
  log("startup", `Target shop: ${config.shopDomain}`);
  if (config.seedTargetShopDomain) {
    log("startup", `Seed target lock: ${config.seedTargetShopDomain}`);
  }
  log("startup", `Mode: ${config.dryRun ? "DRY_RUN" : "LIVE"}`);
  log(
    "startup",
    `Order date window: ${config.orderDateWindow.start.toISOString()} -> ${config.orderDateWindow.end.toISOString()} (${config.orderDateWindow.mode})`,
  );

  if (!config.dryRun && !config.allowDevSeed) {
    throw new Error(
      "Safety check failed: live seeding is blocked unless ALLOW_DEV_SEED=true is explicitly set.",
    );
  }
  if (!config.dryRun && !config.seedTargetShopDomain) {
    throw new Error(
      "Safety check failed: live seeding requires SEED_TARGET_SHOP_DOMAIN to be explicitly set.",
    );
  }
  if (!config.dryRun && config.seedTargetShopDomain !== config.shopDomain) {
    throw new Error(
      `Safety check failed: SHOPIFY_SHOP_DOMAIN (${config.shopDomain}) does not match SEED_TARGET_SHOP_DOMAIN (${config.seedTargetShopDomain}).`,
    );
  }

  const summary = {
    seedRunId: runId,
    timestamp: new Date().toISOString(),
    apiVersion: API_VERSION,
    shopDomain: config.shopDomain,
    dryRun: config.dryRun,
    tags,
    config: {
      customerCount: config.customerCount,
      minOrdersPerCustomer: config.minOrdersPerCustomer,
      maxOrdersPerCustomer: config.maxOrdersPerCustomer,
      totalOrderCount: config.totalOrderCount,
      orderCreateIntervalMs: ORDER_CREATE_INTERVAL_MS,
      orderDateWindow: {
        mode: config.orderDateWindow.mode,
        start: config.orderDateWindow.start.toISOString(),
        end: config.orderDateWindow.end.toISOString(),
      },
      allowDevSeed: config.allowDevSeed,
      seedTargetShopDomain: config.seedTargetShopDomain,
    },
    shop: null,
    variantCount: 0,
    totalPlannedOrders: 0,
    createdCustomerIds: [],
    createdOrderIds: [],
    customers: [],
    orders: [],
    failures: [],
  };
  let variants = [];

  if (config.dryRun) {
    log("dry-run", "Strict dry run enabled: no Shopify API calls will be made.");
    summary.shop = {
      id: null,
      name: null,
      myshopifyDomain: config.shopDomain,
      planDisplayName: null,
      partnerDevelopment: null,
      validationSkipped: true,
    };
    variants = Array.from({ length: 50 }).map((_, index) => ({
      id: `gid://shopify/ProductVariant/dry-run-${index + 1}`,
      title: `Dry Run Variant ${index + 1}`,
      sku: `DRY-${String(index + 1).padStart(4, "0")}`,
      product: {
        id: `gid://shopify/Product/dry-run-${Math.floor(index / 5) + 1}`,
        title: `Dry Run Product ${Math.floor(index / 5) + 1}`,
      },
    }));
    summary.variantCount = variants.length;
  } else {
    const shopInfo = await getShopInfo(endpoint, config.adminToken);
    if (config.seedTargetShopDomain && normalizeShopDomain(shopInfo.myshopifyDomain) !== config.seedTargetShopDomain) {
      throw new Error(
        `Safety check failed: authenticated shop (${shopInfo.myshopifyDomain}) does not match SEED_TARGET_SHOP_DOMAIN (${config.seedTargetShopDomain}).`,
      );
    }
    ensureDevelopmentStore(shopInfo);

    summary.shop = {
      id: shopInfo.id,
      name: shopInfo.name,
      myshopifyDomain: shopInfo.myshopifyDomain,
      planDisplayName: shopInfo?.plan?.displayName || null,
      partnerDevelopment: shopInfo?.plan?.partnerDevelopment ?? null,
      validationSkipped: false,
    };

    log(
      "shop",
      `Confirmed development-oriented store plan '${summary.shop.planDisplayName}' (partnerDevelopment=${String(summary.shop.partnerDevelopment)}).`,
    );

    log("variants", "Loading product variants...");
    variants = await fetchAllVariants(endpoint, config.adminToken);
    summary.variantCount = variants.length;

    if (variants.length === 0) {
      throw new Error("No product variants were found in this store. Add at least one product variant before running the seed script.");
    }

    log("variants", `Loaded ${variants.length} product variants.`);
  }

  const customerPlans = [];
  const segments = Array.from({ length: config.customerCount }, () => chooseOrderSegment());
  const orderCounts = determineOrderCountsPerCustomer({
    customerCount: config.customerCount,
    minOrdersPerCustomer: config.minOrdersPerCustomer,
    maxOrdersPerCustomer: config.maxOrdersPerCustomer,
    totalOrderCount: config.totalOrderCount,
    segments,
  });

  let totalPlannedOrders = 0;

  for (let i = 0; i < config.customerCount; i += 1) {
    const segment = segments[i];
    const orderCount = orderCounts[i];
    const profile = generateCustomerProfile(i, runId);
    const orderDates = generateOrderDates(orderCount, segment, config.orderDateWindow);

    customerPlans.push({
      customerIndex: i,
      segment,
      orderCount,
      orderDates,
      profile,
    });

    totalPlannedOrders += orderCount;
  }

  summary.totalPlannedOrders = totalPlannedOrders;

  const estimatedMinutes = Math.ceil(totalPlannedOrders / 5);
  const totalModeLabel = config.totalOrderCount == null ? "range mode" : "fixed-total mode";
  log(
    "plan",
    `Planned ${config.customerCount} customers and ${totalPlannedOrders} orders (${totalModeLabel}). Estimated minimum live runtime: ~${estimatedMinutes} minute(s) due to 5 orders/min limit.`,
  );

  if (config.dryRun) {
    let runningOrderIndex = 0;

    for (const plan of customerPlans) {
      const progress = `${plan.customerIndex + 1}/${config.customerCount}`;
      log(
        "dry-run",
        `[customer ${progress}] would create ${plan.profile.firstName} ${plan.profile.lastName} <${plan.profile.email}> with ${plan.orderCount} order(s)`,
      );

      const pseudoCustomerId = `dry-run-customer-${String(plan.customerIndex + 1).padStart(4, "0")}`;
      summary.customers.push({
        index: plan.customerIndex + 1,
        segment: plan.segment,
        email: plan.profile.email,
        phone: plan.profile.phone,
        pseudoId: pseudoCustomerId,
        plannedOrderCount: plan.orderCount,
      });

      for (const date of plan.orderDates) {
        runningOrderIndex += 1;
        const lineItems = pickLineItems(variants);
        const pseudoOrderId = `dry-run-order-${String(runningOrderIndex).padStart(5, "0")}`;

        summary.orders.push({
          index: runningOrderIndex,
          pseudoId: pseudoOrderId,
          customerPseudoId: pseudoCustomerId,
          processedAt: date.toISOString(),
          lineItems,
        });
      }
    }

    await fs.writeFile(outputPath, JSON.stringify(summary, null, 2), "utf8");
    log("done", `DRY_RUN complete. Output written to ${outputPath}`);
    return;
  }

  const runtimeFlags = {
    includeCustomerAddresses: true,
    includeOrderAddresses: true,
    orderCustomerMode: "customer", // fallback to deprecated customerId if needed
  };

  const orderPacer = new OrderCreatePacer(ORDER_CREATE_INTERVAL_MS);

  let globalOrderProgress = 0;

  for (const plan of customerPlans) {
    const customerProgressLabel = `[customer ${plan.customerIndex + 1}/${config.customerCount}]`;
    log("customer", `${customerProgressLabel} creating ${plan.profile.email} ...`);

    try {
      const customer = await createCustomerWithRetry({
        endpoint,
        token: config.adminToken,
        profile: plan.profile,
        tags,
        runId,
        runtimeFlags,
        customerProgressLabel,
      });

      summary.createdCustomerIds.push(customer.id);
      summary.customers.push({
        index: plan.customerIndex + 1,
        segment: plan.segment,
        id: customer.id,
        email: plan.profile.email,
        phone: plan.profile.phone,
        plannedOrderCount: plan.orderCount,
      });

      log("customer", `${customerProgressLabel} created ${customer.id}`);

      for (const processedDate of plan.orderDates) {
        globalOrderProgress += 1;
        const orderProgressLabel = `[order ${globalOrderProgress}/${totalPlannedOrders}]`;
        log("order", `${orderProgressLabel} creating for customer ${customer.id} ...`);

        const order = await createOrderWithRetry({
          endpoint,
          token: config.adminToken,
          customerId: customer.id,
          profile: plan.profile,
          tags,
          runId,
          variants,
          processedAt: processedDate.toISOString(),
          runtimeFlags,
          orderPacer,
          orderProgressLabel,
        });

        summary.createdOrderIds.push(order.id);
        summary.orders.push({
          index: globalOrderProgress,
          id: order.id,
          customerId: customer.id,
          processedAt: order.processedAt || processedDate.toISOString(),
        });

        log("order", `${orderProgressLabel} created ${order.id}`);
      }
    } catch (error) {
      summary.failures.push({
        customerIndex: plan.customerIndex + 1,
        email: plan.profile.email,
        error: error.message,
      });

      log("error", `${customerProgressLabel} failed: ${error.message}`);
    }
  }

  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2), "utf8");

  log(
    "done",
    `Seed run complete. Created ${summary.createdCustomerIds.length}/${config.customerCount} customers and ${summary.createdOrderIds.length}/${totalPlannedOrders} orders.`,
  );
  log("done", `Output written to ${outputPath}`);

  if (summary.failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  log("fatal", error.message);
  process.exitCode = 1;
});
