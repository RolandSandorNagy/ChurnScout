import type { CustomerOrderHistory } from "../../domain/customerMetrics";

export const MOCK_METRICS_NOW = "2026-05-13T00:00:00.000Z";

export const MOCK_CUSTOMER_ORDER_HISTORIES: CustomerOrderHistory[] = [
  {
    shopifyCustomerId: "1001",
    orders: [
      { processedAt: "2024-11-20T00:00:00.000Z", totalPrice: 120 },
      { processedAt: "2025-01-12T00:00:00.000Z", totalPrice: 130 },
      { processedAt: "2025-02-28T00:00:00.000Z", totalPrice: 150 },
      { processedAt: "2025-04-18T00:00:00.000Z", totalPrice: 170 },
      { processedAt: "2025-05-30T00:00:00.000Z", totalPrice: 190 },
      { processedAt: "2025-07-10T00:00:00.000Z", totalPrice: 220 },
      { processedAt: "2025-08-16T00:00:00.000Z", totalPrice: 260 },
    ],
  },
  {
    shopifyCustomerId: "1002",
    orders: [
      { processedAt: "2025-06-05T00:00:00.000Z", totalPrice: 120 },
      { processedAt: "2025-08-09T00:00:00.000Z", totalPrice: 130 },
      { processedAt: "2025-10-15T00:00:00.000Z", totalPrice: 137.5 },
    ],
  },
  {
    shopifyCustomerId: "1003",
    orders: [
      { processedAt: "2025-03-01T00:00:00.000Z", totalPrice: 120 },
      { processedAt: "2025-05-02T00:00:00.000Z", totalPrice: 130 },
      { processedAt: "2025-07-07T00:00:00.000Z", totalPrice: 140 },
      { processedAt: "2025-09-11T00:00:00.000Z", totalPrice: 155 },
      { processedAt: "2025-11-14T00:00:00.000Z", totalPrice: 180 },
    ],
  },
  {
    shopifyCustomerId: "1004",
    orders: [
      { processedAt: "2025-05-18T00:00:00.000Z", totalPrice: 120 },
      { processedAt: "2025-07-05T00:00:00.000Z", totalPrice: 132 },
      { processedAt: "2025-08-22T00:00:00.000Z", totalPrice: 140 },
      { processedAt: "2025-10-09T00:00:00.000Z", totalPrice: 150 },
      { processedAt: "2025-11-26T00:00:00.000Z", totalPrice: 160 },
      { processedAt: "2026-01-13T00:00:00.000Z", totalPrice: 190 },
    ],
  },
  {
    shopifyCustomerId: "1005",
    orders: [
      { processedAt: "2025-10-01T00:00:00.000Z", totalPrice: 120 },
      { processedAt: "2025-11-08T00:00:00.000Z", totalPrice: 128 },
      { processedAt: "2025-12-16T00:00:00.000Z", totalPrice: 136 },
      { processedAt: "2026-02-11T00:00:00.000Z", totalPrice: 150 },
    ],
  },
  {
    shopifyCustomerId: "1006",
    orders: [
      { processedAt: "2026-01-16T00:00:00.000Z", totalPrice: 88 },
      { processedAt: "2026-02-20T00:00:00.000Z", totalPrice: 110 },
    ],
  },
  {
    shopifyCustomerId: "1007",
    orders: [
      { processedAt: "2025-07-04T00:00:00.000Z", totalPrice: 130 },
      { processedAt: "2025-08-13T00:00:00.000Z", totalPrice: 140 },
      { processedAt: "2025-09-22T00:00:00.000Z", totalPrice: 150 },
      { processedAt: "2025-11-01T00:00:00.000Z", totalPrice: 160 },
      { processedAt: "2025-12-11T00:00:00.000Z", totalPrice: 165 },
      { processedAt: "2026-01-20T00:00:00.000Z", totalPrice: 175 },
      { processedAt: "2026-03-01T00:00:00.000Z", totalPrice: 185 },
    ],
  },
  {
    shopifyCustomerId: "1008",
    orders: [
      { processedAt: "2025-11-15T00:00:00.000Z", totalPrice: 520 },
      { processedAt: "2025-12-20T00:00:00.000Z", totalPrice: 610 },
      { processedAt: "2026-01-24T00:00:00.000Z", totalPrice: 700 },
      { processedAt: "2026-02-28T00:00:00.000Z", totalPrice: 760 },
      { processedAt: "2026-04-01T00:00:00.000Z", totalPrice: 790 },
      { processedAt: "2026-05-01T00:00:00.000Z", totalPrice: 850 },
    ],
  },
  {
    shopifyCustomerId: "1009",
    orders: [
      { processedAt: "2025-11-10T00:00:00.000Z", totalPrice: 480 },
      { processedAt: "2025-12-18T00:00:00.000Z", totalPrice: 520 },
      { processedAt: "2026-01-25T00:00:00.000Z", totalPrice: 560 },
      { processedAt: "2026-03-03T00:00:00.000Z", totalPrice: 640 },
      { processedAt: "2026-04-22T00:00:00.000Z", totalPrice: 780 },
    ],
  },
  {
    shopifyCustomerId: "1010",
    orders: [
      { processedAt: "2025-09-20T00:00:00.000Z", totalPrice: 210 },
      { processedAt: "2025-10-25T00:00:00.000Z", totalPrice: 220 },
      { processedAt: "2025-11-29T00:00:00.000Z", totalPrice: 230 },
      { processedAt: "2026-01-03T00:00:00.000Z", totalPrice: 240 },
      { processedAt: "2026-02-07T00:00:00.000Z", totalPrice: 250 },
      { processedAt: "2026-03-14T00:00:00.000Z", totalPrice: 260 },
      { processedAt: "2026-04-10T00:00:00.000Z", totalPrice: 730 },
    ],
  },
  {
    shopifyCustomerId: "1011",
    orders: [
      { processedAt: "2026-01-20T00:00:00.000Z", totalPrice: 160 },
      { processedAt: "2026-02-15T00:00:00.000Z", totalPrice: 180 },
      { processedAt: "2026-03-22T00:00:00.000Z", totalPrice: 210 },
      { processedAt: "2026-04-28T00:00:00.000Z", totalPrice: 230 },
    ],
  },
  {
    shopifyCustomerId: "1012",
    orders: [
      { processedAt: "2025-11-02T00:00:00.000Z", totalPrice: 150 },
      { processedAt: "2025-12-05T00:00:00.000Z", totalPrice: 170 },
      { processedAt: "2026-01-08T00:00:00.000Z", totalPrice: 180 },
      { processedAt: "2026-02-14T00:00:00.000Z", totalPrice: 200 },
      { processedAt: "2026-04-20T00:00:00.000Z", totalPrice: 240 },
    ],
  },
  {
    shopifyCustomerId: "1013",
    orders: [
      { processedAt: "2026-03-15T00:00:00.000Z", totalPrice: 190 },
      { processedAt: "2026-04-15T00:00:00.000Z", totalPrice: 230 },
    ],
  },
  {
    shopifyCustomerId: "1014",
    orders: [
      { processedAt: "2026-03-24T00:00:00.000Z", totalPrice: 86 },
      { processedAt: "2026-04-25T00:00:00.000Z", totalPrice: 92 },
    ],
  },
  {
    shopifyCustomerId: "1015",
    orders: [{ processedAt: "2026-05-08T00:00:00.000Z", totalPrice: 89 }],
  },
  {
    shopifyCustomerId: "1016",
    orders: [{ processedAt: "2026-05-05T00:00:00.000Z", totalPrice: 134 }],
  },
  {
    shopifyCustomerId: "1017",
    orders: [{ processedAt: "2026-04-30T00:00:00.000Z", totalPrice: 245 }],
  },
];
