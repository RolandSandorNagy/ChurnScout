import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchShopifyOrderHistory,
  type ShopifyAdminGraphqlClient,
} from "./shopifyOrderHistory.server.js";

interface MockOrderNode {
  processedAt?: string | null;
  amount?: string | null;
  customerId?: string | null;
}

interface MockOrdersPage {
  edges: MockOrderNode[];
  hasNextPage: boolean;
  endCursor: string | null;
}

function toGraphqlPayload(page: MockOrdersPage) {
  return {
    data: {
      orders: {
        edges: page.edges.map((edge) => ({
          node: {
            processedAt: edge.processedAt ?? null,
            currentTotalPriceSet: {
              shopMoney: {
                amount: edge.amount ?? null,
              },
            },
            customer: edge.customerId ? { id: edge.customerId } : null,
          },
        })),
        pageInfo: {
          hasNextPage: page.hasNextPage,
          endCursor: page.endCursor,
        },
      },
    },
  };
}

function buildMockAdminClient(pages: MockOrdersPage[]): {
  client: ShopifyAdminGraphqlClient;
  calls: Array<{ first: number; after: string | null }>;
} {
  let pageIndex = 0;
  const calls: Array<{ first: number; after: string | null }> = [];

  const client: ShopifyAdminGraphqlClient = {
    async graphql(_query, options) {
      calls.push({
        first: options?.variables?.first ?? -1,
        after: options?.variables?.after ?? null,
      });

      const page = pages[pageIndex];
      pageIndex += 1;

      const payload = toGraphqlPayload(
        page ?? { edges: [], hasNextPage: false, endCursor: null },
      );

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };

  return { client, calls };
}

test("fetches paginated orders, skips missing customer ids, and groups by customer", async () => {
  const { client, calls } = buildMockAdminClient([
    {
      edges: [
        {
          processedAt: "2026-05-10T10:00:00.000Z",
          amount: "20.50",
          customerId: "gid://shopify/Customer/1",
        },
        {
          processedAt: "2026-05-09T10:00:00.000Z",
          amount: "99.00",
          customerId: null,
        },
      ],
      hasNextPage: true,
      endCursor: "cursor-1",
    },
    {
      edges: [
        {
          processedAt: "2026-05-08T10:00:00.000Z",
          amount: "45.10",
          customerId: "gid://shopify/Customer/2",
        },
        {
          processedAt: "2026-05-07T10:00:00.000Z",
          amount: "12.25",
          customerId: "gid://shopify/Customer/1",
        },
      ],
      hasNextPage: false,
      endCursor: null,
    },
  ]);

  const result = await fetchShopifyOrderHistory(client, { limit: 10, pageSize: 2 });

  assert.deepEqual(calls, [
    { first: 2, after: null },
    { first: 2, after: "cursor-1" },
  ]);

  assert.deepEqual(result, [
    {
      shopifyCustomerId: "gid://shopify/Customer/1",
      orders: [
        { processedAt: "2026-05-10T10:00:00.000Z", totalPrice: 20.5 },
        { processedAt: "2026-05-07T10:00:00.000Z", totalPrice: 12.25 },
      ],
    },
    {
      shopifyCustomerId: "gid://shopify/Customer/2",
      orders: [{ processedAt: "2026-05-08T10:00:00.000Z", totalPrice: 45.1 }],
    },
  ]);
});

test("uses a safety guard when hasNextPage is true but endCursor is missing", async () => {
  const { client, calls } = buildMockAdminClient([
    {
      edges: [
        {
          processedAt: "2026-05-10T10:00:00.000Z",
          amount: "10.00",
          customerId: "gid://shopify/Customer/10",
        },
      ],
      hasNextPage: true,
      endCursor: null,
    },
  ]);

  const result = await fetchShopifyOrderHistory(client, { limit: 10, pageSize: 5 });

  assert.equal(calls.length, 1);
  assert.deepEqual(result, [
    {
      shopifyCustomerId: "gid://shopify/Customer/10",
      orders: [{ processedAt: "2026-05-10T10:00:00.000Z", totalPrice: 10 }],
    },
  ]);
});

test("respects the configured limit", async () => {
  const { client, calls } = buildMockAdminClient([
    {
      edges: [
        {
          processedAt: "2026-05-10T10:00:00.000Z",
          amount: "8.00",
          customerId: "gid://shopify/Customer/20",
        },
        {
          processedAt: "2026-05-09T10:00:00.000Z",
          amount: "9.00",
          customerId: "gid://shopify/Customer/21",
        },
      ],
      hasNextPage: true,
      endCursor: "cursor-2",
    },
  ]);

  const result = await fetchShopifyOrderHistory(client, { limit: 1, pageSize: 50 });

  assert.deepEqual(calls, [{ first: 1, after: null }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].shopifyCustomerId, "gid://shopify/Customer/20");
  assert.equal(result[0].orders.length, 1);
});

test("throws when Shopify GraphQL returns errors", async () => {
  const client: ShopifyAdminGraphqlClient = {
    async graphql() {
      return new Response(
        JSON.stringify({
          errors: [{ message: "Access denied" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  };

  await assert.rejects(
    () => fetchShopifyOrderHistory(client, { limit: 5 }),
    /Access denied/,
  );
});

