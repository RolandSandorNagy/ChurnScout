export type CustomerSegment = "NEW" | "REPEAT" | "LOYAL" | "VIP" | "AT_RISK" | "LOST";

export interface CustomerOrder {
  processedAt: string;
  totalPrice: number;
}

export interface CustomerOrderHistory {
  shopifyCustomerId: string;
  orders: CustomerOrder[];
}

export interface CustomerMetricConfig {
  now?: Date | string;
  vipSpendThreshold?: number;
  vipOrderThreshold?: number;
  newCustomerWindowDays?: number;
  defaultCadenceDays?: number;
}

export interface CustomerMetrics {
  shopifyCustomerId: string;
  orderCount: number;
  totalSpent: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  averageDaysBetweenOrders: number;
  daysSinceLastOrder: number;
  expectedNextOrderAt: string | null;
  daysOverdue: number;
  segment: CustomerSegment;
  riskScore: number;
  explanation: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  vipSpendThreshold: 1000,
  vipOrderThreshold: 10,
  newCustomerWindowDays: 30,
  defaultCadenceDays: 21,
} as const;

interface ResolvedConfig {
  now: Date;
  vipSpendThreshold: number;
  vipOrderThreshold: number;
  newCustomerWindowDays: number;
  defaultCadenceDays: number;
}

function toWholeDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

function toDaySpan(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / DAY_MS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function resolveConfig(config?: CustomerMetricConfig): ResolvedConfig {
  const now = config?.now instanceof Date ? config.now : config?.now ? new Date(config.now) : new Date();
  const resolvedNow = Number.isNaN(now.getTime()) ? new Date() : now;

  return {
    now: resolvedNow,
    vipSpendThreshold: config?.vipSpendThreshold ?? DEFAULTS.vipSpendThreshold,
    vipOrderThreshold: config?.vipOrderThreshold ?? DEFAULTS.vipOrderThreshold,
    newCustomerWindowDays: config?.newCustomerWindowDays ?? DEFAULTS.newCustomerWindowDays,
    defaultCadenceDays: config?.defaultCadenceDays ?? DEFAULTS.defaultCadenceDays,
  };
}

function buildExplanation(params: {
  segment: CustomerSegment;
  orderCount: number;
  daysSinceLastOrder: number;
  averageDaysBetweenOrders: number;
  totalSpent: number;
  atRiskThreshold: number;
  lostThreshold: number;
  vipReason: string | null;
}): string {
  const cadenceText =
    params.orderCount >= 2
      ? `avg cadence ${round(params.averageDaysBetweenOrders, 1)}d`
      : "cadence not established yet";

  if (params.orderCount === 0) {
    return "No valid completed orders yet. Customer has not established a purchase cadence.";
  }

  if (params.segment === "LOST") {
    return `Customer is LOST: ${params.daysSinceLastOrder}d since last order, above lost threshold ${round(params.lostThreshold, 1)}d (${cadenceText}).`;
  }

  if (params.segment === "AT_RISK") {
    return `Customer is AT_RISK: ${params.daysSinceLastOrder}d since last order, above at-risk threshold ${round(params.atRiskThreshold, 1)}d (${cadenceText}).`;
  }

  if (params.segment === "VIP") {
    return `Customer is VIP (${params.vipReason ?? "high value"}). ${params.orderCount} orders, total spend ${round(params.totalSpent)}.`;
  }

  if (params.segment === "LOYAL") {
    return `Customer is LOYAL: ${params.orderCount} orders with ${cadenceText}, last order ${params.daysSinceLastOrder}d ago.`;
  }

  if (params.segment === "REPEAT") {
    return `Customer is REPEAT: ${params.orderCount} orders and currently within normal timing (${params.daysSinceLastOrder}d since last order, ${cadenceText}).`;
  }

  return `Customer is NEW: ${params.orderCount} order and last order ${params.daysSinceLastOrder}d ago.`;
}

function calculateRiskScore(params: {
  segment: CustomerSegment;
  orderCount: number;
  totalSpent: number;
  daysSinceLastOrder: number;
  averageDaysBetweenOrders: number;
  vipSpendThreshold: number;
  vipOrderThreshold: number;
  defaultCadenceDays: number;
}): number {
  if (params.orderCount === 0) {
    return 0;
  }

  const cadenceDays =
    params.orderCount >= 2
      ? Math.max(1, params.averageDaysBetweenOrders)
      : Math.max(1, params.defaultCadenceDays);

  const overdueRatio = params.daysSinceLastOrder / cadenceDays;
  const timeFactor = clamp((overdueRatio - 0.8) / 2.2, 0, 1);
  const spendFactor = clamp(params.totalSpent / params.vipSpendThreshold, 0, 1);
  const frequencyFactor = clamp(params.orderCount / params.vipOrderThreshold, 0, 1);
  const engagementFactor = clamp(params.orderCount / 6, 0, 1);

  let score =
    timeFactor * 70 +
    spendFactor * 15 +
    frequencyFactor * 10 +
    engagementFactor * 5;

  if (params.orderCount === 1) {
    score *= 0.6;
  }

  if (params.segment === "AT_RISK") {
    score = Math.max(score, 60);
  }

  if (params.segment === "LOST") {
    score = Math.max(score, 80);
  }

  return Math.round(clamp(score, 0, 100));
}

export function calculateCustomerMetrics(
  customerHistory: CustomerOrderHistory,
  config?: CustomerMetricConfig,
): CustomerMetrics {
  const resolved = resolveConfig(config);

  const normalizedOrders = customerHistory.orders
    .map((order) => ({
      processedAt: new Date(order.processedAt),
      totalPrice: Number.isFinite(order.totalPrice) ? order.totalPrice : 0,
    }))
    .filter((order) => !Number.isNaN(order.processedAt.getTime()))
    .sort((a, b) => a.processedAt.getTime() - b.processedAt.getTime());

  const orderCount = normalizedOrders.length;
  const totalSpent = round(
    normalizedOrders.reduce((sum, order) => sum + Math.max(0, order.totalPrice), 0),
  );
  const averageOrderValue = orderCount > 0 ? round(totalSpent / orderCount) : 0;

  const firstOrder = orderCount > 0 ? normalizedOrders[0].processedAt : null;
  const lastOrder = orderCount > 0 ? normalizedOrders[orderCount - 1].processedAt : null;

  const gaps: number[] = [];
  for (let i = 1; i < normalizedOrders.length; i += 1) {
    gaps.push(Math.max(0, toDaySpan(normalizedOrders[i - 1].processedAt, normalizedOrders[i].processedAt)));
  }

  const averageDaysBetweenOrders =
    gaps.length > 0 ? round(gaps.reduce((sum, days) => sum + days, 0) / gaps.length, 2) : 0;

  const daysSinceLastOrder =
    lastOrder === null ? 0 : Math.max(0, toWholeDays(lastOrder, resolved.now));

  const cadenceDaysForProjection =
    orderCount >= 2 ? Math.max(1, averageDaysBetweenOrders) : resolved.defaultCadenceDays;

  const expectedNextOrder =
    lastOrder === null
      ? null
      : new Date(lastOrder.getTime() + cadenceDaysForProjection * DAY_MS);

  const daysOverdue =
    expectedNextOrder === null ? 0 : Math.max(0, toWholeDays(expectedNextOrder, resolved.now));

  const atRiskThreshold =
    orderCount >= 2 ? Math.max(45, averageDaysBetweenOrders * 1.5) : Number.POSITIVE_INFINITY;
  const lostThreshold =
    orderCount >= 2 ? Math.max(90, averageDaysBetweenOrders * 2.5) : Number.POSITIVE_INFINITY;

  const isLost = orderCount >= 2 && daysSinceLastOrder > lostThreshold;
  const isAtRisk = orderCount >= 2 && !isLost && daysSinceLastOrder > atRiskThreshold;

  const vipBySpend = totalSpent >= resolved.vipSpendThreshold;
  const vipByOrderCount = orderCount >= resolved.vipOrderThreshold;
  const isVip = vipBySpend || vipByOrderCount;

  let segment: CustomerSegment;
  if (isLost) {
    segment = "LOST";
  } else if (isAtRisk) {
    segment = "AT_RISK";
  } else if (isVip) {
    segment = "VIP";
  } else if (orderCount === 1 && daysSinceLastOrder <= resolved.newCustomerWindowDays) {
    segment = "NEW";
  } else if (orderCount >= 3) {
    segment = "LOYAL";
  } else if (orderCount >= 2) {
    segment = "REPEAT";
  } else {
    segment = "NEW";
  }

  const vipReason = vipBySpend
    ? `spend ${round(totalSpent)} >= ${resolved.vipSpendThreshold}`
    : vipByOrderCount
      ? `order count ${orderCount} >= ${resolved.vipOrderThreshold}`
      : null;

  const riskScore = calculateRiskScore({
    segment,
    orderCount,
    totalSpent,
    daysSinceLastOrder,
    averageDaysBetweenOrders,
    vipSpendThreshold: resolved.vipSpendThreshold,
    vipOrderThreshold: resolved.vipOrderThreshold,
    defaultCadenceDays: resolved.defaultCadenceDays,
  });

  return {
    shopifyCustomerId: customerHistory.shopifyCustomerId,
    orderCount,
    totalSpent,
    averageOrderValue,
    firstOrderAt: firstOrder?.toISOString() ?? null,
    lastOrderAt: lastOrder?.toISOString() ?? null,
    averageDaysBetweenOrders,
    daysSinceLastOrder,
    expectedNextOrderAt: expectedNextOrder?.toISOString() ?? null,
    daysOverdue,
    segment,
    riskScore,
    explanation: buildExplanation({
      segment,
      orderCount,
      daysSinceLastOrder,
      averageDaysBetweenOrders,
      totalSpent,
      atRiskThreshold,
      lostThreshold,
      vipReason,
    }),
  };
}
