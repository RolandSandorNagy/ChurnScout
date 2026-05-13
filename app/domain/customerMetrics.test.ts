import test from "node:test";
import assert from "node:assert/strict";
import { calculateCustomerMetrics } from "./customerMetrics.js";

const NOW = "2026-05-13T00:00:00.000Z";

function history(
  shopifyCustomerId: string,
  orders: Array<{ processedAt: string; totalPrice: number }>,
) {
  return { shopifyCustomerId, orders };
}

test("handles empty order history safely", () => {
  const result = calculateCustomerMetrics(history("c-empty", []), { now: NOW });

  assert.equal(result.orderCount, 0);
  assert.equal(result.totalSpent, 0);
  assert.equal(result.averageOrderValue, 0);
  assert.equal(result.firstOrderAt, null);
  assert.equal(result.lastOrderAt, null);
  assert.equal(result.expectedNextOrderAt, null);
  assert.equal(result.daysSinceLastOrder, 0);
  assert.equal(result.daysOverdue, 0);
  assert.equal(result.segment, "NEW");
});

test("classifies one-time customer as NEW", () => {
  const result = calculateCustomerMetrics(
    history("c-new", [{ processedAt: "2026-05-05T00:00:00.000Z", totalPrice: 100 }]),
    { now: NOW },
  );

  assert.equal(result.orderCount, 1);
  assert.equal(result.segment, "NEW");
  assert.equal(result.daysSinceLastOrder, 8);
});

test("classifies two-order customer as REPEAT", () => {
  const result = calculateCustomerMetrics(
    history("c-repeat", [
      { processedAt: "2026-04-10T00:00:00.000Z", totalPrice: 120 },
      { processedAt: "2026-05-05T00:00:00.000Z", totalPrice: 80 },
    ]),
    { now: NOW },
  );

  assert.equal(result.segment, "REPEAT");
  assert.equal(result.orderCount, 2);
  assert.equal(result.averageDaysBetweenOrders, 25);
});

test("classifies three-order customer as LOYAL when not overdue", () => {
  const result = calculateCustomerMetrics(
    history("c-loyal", [
      { processedAt: "2026-03-20T00:00:00.000Z", totalPrice: 90 },
      { processedAt: "2026-04-10T00:00:00.000Z", totalPrice: 110 },
      { processedAt: "2026-05-01T00:00:00.000Z", totalPrice: 130 },
    ]),
    { now: NOW },
  );

  assert.equal(result.segment, "LOYAL");
  assert.equal(result.orderCount, 3);
});

test("classifies customer as VIP by spend threshold", () => {
  const result = calculateCustomerMetrics(
    history("c-vip-spend", [
      { processedAt: "2026-04-05T00:00:00.000Z", totalPrice: 650 },
      { processedAt: "2026-05-02T00:00:00.000Z", totalPrice: 500 },
    ]),
    { now: NOW, vipSpendThreshold: 1000, vipOrderThreshold: 10 },
  );

  assert.equal(result.segment, "VIP");
  assert.equal(result.totalSpent, 1150);
});

test("classifies customer as VIP by order count threshold", () => {
  const orders = Array.from({ length: 10 }, (_, i) => ({
    processedAt: new Date(Date.UTC(2026, 3, 1 + i)).toISOString(),
    totalPrice: 20,
  }));

  const result = calculateCustomerMetrics(history("c-vip-count", orders), {
    now: NOW,
    vipSpendThreshold: 5000,
    vipOrderThreshold: 10,
  });

  assert.equal(result.segment, "VIP");
  assert.equal(result.orderCount, 10);
});

test("classifies overdue customer as AT_RISK", () => {
  const result = calculateCustomerMetrics(
    history("c-at-risk", [
      { processedAt: "2026-01-10T00:00:00.000Z", totalPrice: 120 },
      { processedAt: "2026-02-10T00:00:00.000Z", totalPrice: 140 },
      { processedAt: "2026-03-10T00:00:00.000Z", totalPrice: 130 },
    ]),
    { now: NOW },
  );

  assert.equal(result.segment, "AT_RISK");
  assert.ok(result.riskScore >= 60);
});

test("classifies heavily overdue customer as LOST", () => {
  const result = calculateCustomerMetrics(
    history("c-lost", [
      { processedAt: "2025-10-01T00:00:00.000Z", totalPrice: 200 },
      { processedAt: "2025-11-01T00:00:00.000Z", totalPrice: 200 },
      { processedAt: "2025-12-01T00:00:00.000Z", totalPrice: 200 },
    ]),
    { now: NOW },
  );

  assert.equal(result.segment, "LOST");
  assert.ok(result.riskScore >= 80);
});

test("handles same-day orders safely", () => {
  const result = calculateCustomerMetrics(
    history("c-same-day", [
      { processedAt: "2026-05-01T09:00:00.000Z", totalPrice: 50 },
      { processedAt: "2026-05-01T15:00:00.000Z", totalPrice: 70 },
      { processedAt: "2026-05-02T09:00:00.000Z", totalPrice: 80 },
    ]),
    { now: NOW },
  );

  assert.equal(result.averageDaysBetweenOrders, 0.5);
  assert.equal(result.orderCount, 3);
});

test("sorts unsorted orders internally", () => {
  const result = calculateCustomerMetrics(
    history("c-unsorted", [
      { processedAt: "2026-05-01T00:00:00.000Z", totalPrice: 90 },
      { processedAt: "2026-03-01T00:00:00.000Z", totalPrice: 70 },
      { processedAt: "2026-04-01T00:00:00.000Z", totalPrice: 80 },
    ]),
    { now: NOW },
  );

  assert.equal(result.firstOrderAt, "2026-03-01T00:00:00.000Z");
  assert.equal(result.lastOrderAt, "2026-05-01T00:00:00.000Z");
  assert.equal(result.averageDaysBetweenOrders, 30.5);
});
