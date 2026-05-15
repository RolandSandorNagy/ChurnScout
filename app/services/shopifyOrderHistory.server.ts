import type { CustomerOrderHistory } from "../domain/customerMetrics";

const ORDERS_QUERY = `#graphql
  query ChurnScoutOrdersPage($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true) {
      edges {
        node {
          processedAt
          currentTotalPriceSet {
            shopMoney {
              amount
            }
          }
          customer {
            id
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

const DEFAULT_DEV_ORDER_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 250;

export interface ShopifyAdminGraphqlClient {
  graphql(
    query: string,
    options?: {
      variables?: {
        first: number;
        after: string | null;
      };
    },
  ): Promise<Response>;
}

export interface FetchShopifyOrderHistoryOptions {
  limit?: number;
  pageSize?: number;
}

interface OrdersQueryResponse {
  data?: {
    orders?: {
      edges?: Array<{
        node?: {
          processedAt?: string | null;
          currentTotalPriceSet?: {
            shopMoney?: {
              amount?: string | null;
            } | null;
          } | null;
          customer?: {
            id?: string | null;
          } | null;
        } | null;
      } | null> | null;
      pageInfo?: {
        hasNextPage?: boolean | null;
        endCursor?: string | null;
      } | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string | null }> | null;
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

function toPrice(amount: string | null | undefined): number {
  const parsed = Number.parseFloat(amount ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function toErrorMessage(payload: OrdersQueryResponse): string {
  if (!payload.errors || payload.errors.length === 0) {
    return "Shopify GraphQL query failed.";
  }

  return payload.errors
    .map((error) => error.message?.trim())
    .filter((message): message is string => Boolean(message))
    .join("; ");
}

/**
 * Live order-history fetcher for MVP usage.
 * This function intentionally does not sync or persist Shopify customer/order data.
 * It only normalizes the minimal fields needed for in-memory churn calculations.
 */
export async function fetchShopifyOrderHistory(
  adminClient: ShopifyAdminGraphqlClient,
  options: FetchShopifyOrderHistoryOptions = {},
): Promise<CustomerOrderHistory[]> {
  const limit = toPositiveInt(options.limit, DEFAULT_DEV_ORDER_LIMIT);
  const requestedPageSize = toPositiveInt(options.pageSize, DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.min(limit, requestedPageSize));

  // TODO: Ensure merchants grant read_all_orders for complete historical analysis.
  // TODO: Optional future optimization: cache derived metrics only (not raw Shopify records).
  // TODO: Add background sync only if report/alert workloads require asynchronous processing.

  const ordersByCustomer = new Map<string, CustomerOrderHistory["orders"]>();

  let fetchedOrderCount = 0;
  let afterCursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && fetchedOrderCount < limit) {
    const first = Math.min(pageSize, limit - fetchedOrderCount);

    const response = await adminClient.graphql(ORDERS_QUERY, {
      variables: {
        first,
        after: afterCursor,
      },
    });

    const payload = (await response.json()) as OrdersQueryResponse;
    if (!response.ok || (payload.errors && payload.errors.length > 0)) {
      throw new Error(toErrorMessage(payload));
    }

    const orders = payload.data?.orders;
    if (!orders) {
      break;
    }

    for (const edge of orders.edges ?? []) {
      if (fetchedOrderCount >= limit) {
        break;
      }

      fetchedOrderCount += 1;

      const node = edge?.node;
      const shopifyCustomerId = node?.customer?.id;

      // Skip guest/anonymous orders to keep the output grouped by Shopify customer id.
      if (!shopifyCustomerId) {
        continue;
      }

      const processedAt = node?.processedAt;
      if (!processedAt) {
        continue;
      }

      const customerOrders = ordersByCustomer.get(shopifyCustomerId);
      const normalizedOrder = {
        processedAt,
        totalPrice: toPrice(node?.currentTotalPriceSet?.shopMoney?.amount),
      };

      if (customerOrders) {
        customerOrders.push(normalizedOrder);
      } else {
        ordersByCustomer.set(shopifyCustomerId, [normalizedOrder]);
      }
    }

    hasNextPage = orders.pageInfo?.hasNextPage ?? false;
    const endCursor = orders.pageInfo?.endCursor ?? null;

    // Safety guard to avoid an infinite loop on malformed pageInfo responses.
    if (hasNextPage && !endCursor) {
      break;
    }

    afterCursor = endCursor;
  }

  return Array.from(ordersByCustomer.entries()).map(([shopifyCustomerId, customerOrders]) => ({
    shopifyCustomerId,
    orders: customerOrders,
  }));
}

