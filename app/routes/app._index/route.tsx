import { Fragment, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { calculateCustomerMetrics, type CustomerMetrics, type CustomerSegment } from "../../domain/customerMetrics";
import { fetchShopifyOrderHistory } from "../../services/shopifyOrderHistory.server";
import { MOCK_CUSTOMER_ORDER_HISTORIES, MOCK_METRICS_NOW } from "./mockCustomerOrderHistories";
import styles from "./styles.module.css";

const LIVE_PREVIEW_ORDER_LIMIT = 100;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const shopDomain = new URL(request.url).searchParams.get("shop");

  const fallbackMetrics = MOCK_CUSTOMER_ORDER_HISTORIES.map((history) =>
    calculateCustomerMetrics(history, { now: MOCK_METRICS_NOW }),
  );

  // TODO: Request read_all_orders if deeper order history is needed later.
  // TODO: Add an optional derived-metrics cache only if performance/reporting requires it.
  // TODO: Add explicit merchant controls for refresh behavior and live-vs-mock fallback mode.
  try {
    const liveHistories = await fetchShopifyOrderHistory(admin, {
      limit: LIVE_PREVIEW_ORDER_LIMIT,
    });

    const liveMetrics = liveHistories
      .map((history) => calculateCustomerMetrics(history))
      .filter((metric) => metric.orderCount > 0);

    if (liveMetrics.length > 0) {
      return {
        dataSource: "live" as const,
        metrics: liveMetrics,
        shopDomain,
      };
    }
  } catch (_error) {
    // Keep dashboard stable and safely fall back to mock preview data.
  }

  return {
    dataSource: "mock" as const,
    metrics: fallbackMetrics,
    shopDomain,
  };
};

type Segment = "At Risk" | "Lost" | "VIP" | "Loyal" | "Repeat" | "New";
type Priority = "High" | "Medium" | "Low";
type BadgeTone = "info" | "success" | "warning" | "critical" | "caution" | "neutral" | "auto";
type Tab = "All" | Segment;

interface Customer {
  id: string;
  segment: Segment;
  priority: Priority;
  orderCount: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate: string;
  daysSinceLastOrder: number;
  avgOrderFrequencyDays: number;
  expectedNextOrderDate: string;
  delayDays: number;
  riskScore: number;
  recoveryOpportunity: number;
  explanation: string;
  segmentRuleSummary: string;
  atRiskThresholdDays: number | null;
  lostThresholdDays: number | null;
  suggestedAction: string;
  whyFlagged: string;
}

const HIGH_SPEND_THRESHOLD = 1000;
const HIGH_ORDER_COUNT_THRESHOLD = 6;
const HIGH_RISK_THRESHOLD = 80;
const SEGMENT_VIP_SPEND_THRESHOLD = 1000;
const SEGMENT_VIP_ORDER_THRESHOLD = 10;
const SEGMENT_NEW_CUSTOMER_WINDOW_DAYS = 30;

function toUiSegment(segment: CustomerSegment): Segment {
  if (segment === "AT_RISK") return "At Risk";
  if (segment === "LOST") return "Lost";
  if (segment === "VIP") return "VIP";
  if (segment === "LOYAL") return "Loyal";
  if (segment === "REPEAT") return "Repeat";
  return "New";
}

function fmtDate(isoDate: string | null): string {
  if (!isoDate) return "N/A";
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtDays(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundDays(value: number): number {
  return Math.round(value * 10) / 10;
}

function deriveSegmentTimingThresholds(orderCount: number, averageDaysBetweenOrders: number) {
  if (orderCount < 2) {
    return {
      atRiskThresholdDays: null,
      lostThresholdDays: null,
    };
  }

  return {
    atRiskThresholdDays: roundDays(Math.max(45, averageDaysBetweenOrders * 1.5)),
    lostThresholdDays: roundDays(Math.max(90, averageDaysBetweenOrders * 2.5)),
  };
}

function deriveSegmentRuleSummary(customer: {
  segment: Segment;
  orderCount: number;
  totalSpent: number;
  daysSinceLastOrder: number;
  avgOrderFrequencyDays: number;
  atRiskThresholdDays: number | null;
  lostThresholdDays: number | null;
}): string {
  if (customer.segment === "Lost") {
    return `LOST because ${customer.daysSinceLastOrder}d since last order is above lost threshold ${fmtDays(customer.lostThresholdDays ?? 0)}d.`;
  }

  if (customer.segment === "At Risk") {
    return `AT_RISK because ${customer.daysSinceLastOrder}d since last order is above at-risk threshold ${fmtDays(customer.atRiskThresholdDays ?? 0)}d.`;
  }

  if (customer.segment === "VIP") {
    if (customer.totalSpent >= SEGMENT_VIP_SPEND_THRESHOLD) {
      return `VIP because total spend $${fmtMoney(customer.totalSpent)} is above $${fmtMoney(SEGMENT_VIP_SPEND_THRESHOLD)}.`;
    }

    return `VIP because order count ${customer.orderCount} is at least ${SEGMENT_VIP_ORDER_THRESHOLD}.`;
  }

  if (customer.segment === "Loyal") {
    return `LOYAL because customer has ${customer.orderCount} orders and is still within normal timing.`;
  }

  if (customer.segment === "Repeat") {
    return `REPEAT because customer has ${customer.orderCount} orders and no at-risk timing breach.`;
  }

  if (customer.orderCount === 1 && customer.daysSinceLastOrder <= SEGMENT_NEW_CUSTOMER_WINDOW_DAYS) {
    return `NEW because customer has 1 order within ${SEGMENT_NEW_CUSTOMER_WINDOW_DAYS} days.`;
  }

  return "NEW because customer has limited order history and no churn-timing signal yet.";
}

function buildOverdueMultiple(daysSinceLastOrder: number, avgOrderFrequencyDays: number, orderCount: number): string | null {
  if (orderCount < 2 || avgOrderFrequencyDays <= 0) return null;
  const ratio = daysSinceLastOrder / avgOrderFrequencyDays;
  if (ratio < 1.5) return null;
  return `${fmtDays(ratio)}x later than usual`;
}

function derivePriority(customer: {
  segment: Segment;
  totalSpent: number;
  orderCount: number;
  riskScore: number;
  delayDays: number;
}): Priority {
  const highValueSignal =
    customer.totalSpent >= HIGH_SPEND_THRESHOLD ||
    customer.orderCount >= HIGH_ORDER_COUNT_THRESHOLD ||
    customer.riskScore >= HIGH_RISK_THRESHOLD;

  if ((customer.segment === "Lost" || customer.segment === "At Risk") && highValueSignal) {
    return "High";
  }

  if (customer.segment === "At Risk" || customer.segment === "Lost") {
    return "Medium";
  }

  if ((customer.segment === "Loyal" || customer.segment === "VIP") && customer.delayDays > 0) {
    return "Medium";
  }

  return "Low";
}

function deriveRecoveryOpportunity(customer: {
  segment: Segment;
  priority: Priority;
  averageOrderValue: number;
}): number {
  if (customer.priority === "High" && (customer.segment === "At Risk" || customer.segment === "Lost")) {
    return roundMoney(customer.averageOrderValue);
  }

  if (customer.priority === "Medium") {
    return roundMoney(customer.averageOrderValue * 0.5);
  }

  return 0;
}

function deriveSuggestedAction(customer: {
  segment: Segment;
  priority: Priority;
  riskScore: number;
  totalSpent: number;
  orderCount: number;
  delayDays: number;
}): string {
  if (customer.priority === "High") {
    if (
      customer.segment === "Lost" &&
      (customer.totalSpent >= HIGH_SPEND_THRESHOLD || customer.orderCount >= HIGH_ORDER_COUNT_THRESHOLD)
    ) {
      return "Send personal winback offer";
    }

    if ((customer.segment === "Lost" || customer.segment === "At Risk") && customer.riskScore >= 85) {
      return "Send personal winback offer";
    }

    return "Send 10% reactivation discount";
  }

  if (customer.priority === "Medium") {
    if (customer.segment === "At Risk" || customer.segment === "Lost") {
      return "Send re-engagement email";
    }

    if (customer.segment === "VIP") {
      return "Invite to VIP early access";
    }

    return "Cross-sell related products";
  }

  if (customer.segment === "New") {
    return "Wait for second-purchase window";
  }

  if (customer.segment === "Repeat") {
    if (customer.orderCount === 2 && customer.delayDays <= 10) {
      return "Wait for second-purchase window";
    }

    return customer.delayDays > 0 ? "Send re-engagement email" : "Cross-sell related products";
  }

  if (customer.segment === "VIP") {
    return "Invite to VIP early access";
  }

  return "No action needed yet";
}

function deriveWhyFlagged(customer: {
  segment: Segment;
  priority: Priority;
  daysSinceLastOrder: number;
  avgOrderFrequencyDays: number;
  orderCount: number;
  delayDays: number;
}): string {
  const overdueMultiple = buildOverdueMultiple(
    customer.daysSinceLastOrder,
    customer.avgOrderFrequencyDays,
    customer.orderCount,
  );

  if (customer.segment === "Lost" && customer.priority === "High") {
    return "High-value lost customer";
  }

  if ((customer.segment === "Lost" || customer.segment === "At Risk") && overdueMultiple) {
    return overdueMultiple;
  }

  if ((customer.segment === "VIP" || customer.segment === "Loyal") && customer.delayDays > 0) {
    return `${customer.delayDays}d overdue`;
  }

  if (customer.segment === "VIP") {
    return "VIP still on track";
  }

  if (customer.segment === "New") {
    return "New customer, waiting for repeat purchase";
  }

  if (customer.delayDays > 0) {
    return `${customer.delayDays}d overdue`;
  }

  return "No immediate churn risk";
}

function toCustomer(metrics: CustomerMetrics): Customer {
  const segment = toUiSegment(metrics.segment);
  const { atRiskThresholdDays, lostThresholdDays } = deriveSegmentTimingThresholds(
    metrics.orderCount,
    metrics.averageDaysBetweenOrders,
  );

  const baseCustomer = {
    id: metrics.shopifyCustomerId,
    segment,
    orderCount: metrics.orderCount,
    totalSpent: metrics.totalSpent,
    averageOrderValue: metrics.averageOrderValue,
    lastOrderDate: fmtDate(metrics.lastOrderAt),
    daysSinceLastOrder: metrics.daysSinceLastOrder,
    avgOrderFrequencyDays: metrics.averageDaysBetweenOrders,
    expectedNextOrderDate: fmtDate(metrics.expectedNextOrderAt),
    delayDays: metrics.daysOverdue,
    riskScore: metrics.riskScore,
    explanation: metrics.explanation,
    atRiskThresholdDays,
    lostThresholdDays,
  };

  const priority = derivePriority(baseCustomer);
  const recoveryOpportunity = deriveRecoveryOpportunity({
    segment: baseCustomer.segment,
    priority,
    averageOrderValue: baseCustomer.averageOrderValue,
  });

  return {
    ...baseCustomer,
    priority,
    recoveryOpportunity,
    segmentRuleSummary: deriveSegmentRuleSummary({
      segment: baseCustomer.segment,
      orderCount: baseCustomer.orderCount,
      totalSpent: baseCustomer.totalSpent,
      daysSinceLastOrder: baseCustomer.daysSinceLastOrder,
      avgOrderFrequencyDays: baseCustomer.avgOrderFrequencyDays,
      atRiskThresholdDays: baseCustomer.atRiskThresholdDays,
      lostThresholdDays: baseCustomer.lostThresholdDays,
    }),
    suggestedAction: deriveSuggestedAction({
      segment: baseCustomer.segment,
      priority,
      riskScore: baseCustomer.riskScore,
      totalSpent: baseCustomer.totalSpent,
      orderCount: baseCustomer.orderCount,
      delayDays: baseCustomer.delayDays,
    }),
    whyFlagged: deriveWhyFlagged({
      segment: baseCustomer.segment,
      priority,
      daysSinceLastOrder: baseCustomer.daysSinceLastOrder,
      avgOrderFrequencyDays: baseCustomer.avgOrderFrequencyDays,
      orderCount: baseCustomer.orderCount,
      delayDays: baseCustomer.delayDays,
    }),
  };
}

const TABS: Tab[] = ["All", "At Risk", "Lost", "VIP", "Loyal", "Repeat", "New"];

const SEGMENT_TONE: Record<Segment, BadgeTone> = {
  "At Risk": "warning",
  Lost: "critical",
  VIP: "caution",
  Loyal: "success",
  Repeat: "info",
  New: "info",
};

const PRIORITY_TONE_CLASS: Record<Priority, string> = {
  High: styles.priorityHigh,
  Medium: styles.priorityMedium,
  Low: styles.priorityLow,
};

const PRIORITY_SORT_WEIGHT: Record<Priority, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function delayClass(delayDays: number) {
  if (delayDays <= 0) return styles.delayOnTrack;
  if (delayDays <= 30) return styles.delayWatch;
  return styles.delayOverdue;
}

function delayLabel(delayDays: number) {
  if (delayDays <= 0) return "On track";
  return `${delayDays}d overdue`;
}

function extractNumericIdFromGid(gid: string): string | null {
  const match = gid.match(/\/(\d+)$/);
  return match?.[1] ?? null;
}

function buildShopifyCustomerAdminUrl(shopDomain: string | null, customerGid: string): string | null {
  if (!shopDomain) return null;

  const numericId = extractNumericIdFromGid(customerGid);
  if (!numericId) return null;

  return `https://${shopDomain}/admin/customers/${numericId}`;
}

function compareCustomersByPriorityAndRisk(a: Customer, b: Customer): number {
  const priorityDelta = PRIORITY_SORT_WEIGHT[b.priority] - PRIORITY_SORT_WEIGHT[a.priority];
  if (priorityDelta !== 0) return priorityDelta;

  const riskDelta = b.riskScore - a.riskScore;
  if (riskDelta !== 0) return riskDelta;

  const opportunityDelta = b.recoveryOpportunity - a.recoveryOpportunity;
  if (opportunityDelta !== 0) return opportunityDelta;

  return b.totalSpent - a.totalSpent;
}

export default function Index() {
  const { dataSource, metrics, shopDomain } = useLoaderData<typeof loader>();
  const customers = metrics.map(toCustomer);

  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  const lost = customers.filter((c) => c.segment === "Lost");
  const actionableCustomers = customers.filter((c) => c.priority !== "Low");
  const highPriorityWinbacks = customers.filter((c) => c.priority === "High");
  const revenueOpportunity = customers.reduce((sum, customer) => sum + customer.recoveryOpportunity, 0);

  const sortedCustomers = [...customers].sort(compareCustomersByPriorityAndRisk);

  const filtered =
    activeTab === "All"
      ? sortedCustomers
      : sortedCustomers.filter((customer) => customer.segment === activeTab);

  const topPriorityCustomers = sortedCustomers.filter((customer) => customer.priority !== "Low").slice(0, 4);

  const topPriorities =
    topPriorityCustomers.length > 0
      ? topPriorityCustomers.map(
          (customer) =>
            `Customer #${customer.id}: ${customer.priority} priority, approx. $${fmt(customer.recoveryOpportunity)} recovery opportunity. ${customer.suggestedAction}.`,
        )
      : ["No urgent priorities this week. Keep monitoring customer rhythm and repeat purchases."];

  return (
    <s-page heading="ChurnScout">
      <p className={styles.subtitle}>
        Detect at-risk customers and customer winback opportunities from Shopify order history.
      </p>
      <div className={styles.dataSourceMeta}>
        <span className={`${styles.dataSourceBadge} ${dataSource === "live" ? styles.liveBadge : styles.mockBadge}`}>
          {dataSource === "live" ? "Live Shopify data preview" : "Mock demo data"}
        </span>
        <p className={styles.dataSourceNote}>
          Live preview fetches minimal Shopify order data in memory. ChurnScout does not store raw Shopify
          order/customer data in this MVP.
        </p>
      </div>

      <s-section heading="Overview">
        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <div className={styles.cardValue}>{customers.length}</div>
            <div className={styles.cardLabel}>Customers reviewed</div>
          </div>
          <div className={`${styles.card} ${styles.cardWarning}`}>
            <div className={styles.cardValue}>{actionableCustomers.length}</div>
            <div className={styles.cardLabel}>Need attention</div>
          </div>
          <div className={`${styles.card} ${styles.cardCritical}`}>
            <div className={styles.cardValue}>{lost.length}</div>
            <div className={styles.cardLabel}>Lost customers</div>
          </div>
          <div className={`${styles.card} ${styles.cardCritical}`}>
            <div className={styles.cardValue}>{highPriorityWinbacks.length}</div>
            <div className={styles.cardLabel}>High-priority winbacks</div>
          </div>
          <div className={`${styles.card} ${styles.cardSuccess}`}>
            <div className={styles.cardValue}>${fmt(revenueOpportunity)}</div>
            <div className={styles.cardLabel}>Revenue opportunity</div>
          </div>
        </div>
      </s-section>

      <s-section heading="This week's insight">
        <div className={styles.insightBox}>
          <div className={styles.insightBody}>
            <p>
              You have <strong>{actionableCustomers.length} customers needing attention</strong>, including{" "}
              <strong>{highPriorityWinbacks.length} high-priority winbacks</strong>.
            </p>
            <p>
              Based on recent purchase behavior, the current recovery opportunity is about{" "}
              <strong>${fmt(revenueOpportunity)}</strong>.
            </p>
          </div>
        </div>
      </s-section>

      <s-section heading="Top priorities this week">
        <ul className={styles.priorityList}>
          {topPriorities.map((priority) => (
            <li key={priority}>{priority}</li>
          ))}
        </ul>
      </s-section>

      <s-section heading="How ChurnScout calculates this">
        <div className={styles.calcBox}>
          ChurnScout segments customers from order history using transparent timing and value rules. Timing rules
          compare days since last order against each customer's own purchase cadence.
        </div>
        <div className={styles.segmentRulesWrapper}>
          <table className={styles.segmentRulesTable}>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Lost</td>
                <td>
                  2+ orders and <code>days since last order &gt; max(90, avg cadence * 2.5)</code>
                </td>
              </tr>
              <tr>
                <td>At Risk</td>
                <td>
                  2+ orders and <code>days since last order &gt; max(45, avg cadence * 1.5)</code>, but not Lost
                </td>
              </tr>
              <tr>
                <td>VIP</td>
                <td>
                  <code>total spent &gt;= ${SEGMENT_VIP_SPEND_THRESHOLD}</code> or{" "}
                  <code>order count &gt;= {SEGMENT_VIP_ORDER_THRESHOLD}</code>
                </td>
              </tr>
              <tr>
                <td>Loyal</td>
                <td>3+ orders, not At Risk/Lost/VIP</td>
              </tr>
              <tr>
                <td>Repeat</td>
                <td>2 orders, not At Risk/Lost/VIP</td>
              </tr>
              <tr>
                <td>New</td>
                <td>
                  1 order within {SEGMENT_NEW_CUSTOMER_WINDOW_DAYS} days, or limited history without risk signal
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </s-section>

      <s-section heading="Customers">
        <div className={styles.tabs}>
          {TABS.map((tab) => {
            const count =
              tab === "All"
                ? customers.length
                : customers.filter((customer) => customer.segment === tab).length;
            return (
              <button
                key={tab}
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
                <span className={styles.tabCount}>{count}</span>
              </button>
            );
          })}
        </div>

        <p className={styles.filterNote}>Filters are applied locally in this MVP preview.</p>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Purchase</th>
                <th>Timing</th>
                <th>Priority</th>
                <th>Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const isExpanded = expandedCustomerId === customer.id;
                const shopifyCustomerUrl = buildShopifyCustomerAdminUrl(shopDomain, customer.id);

                return (
                  <Fragment key={customer.id}>
                    <tr>
                      <td>
                        <div className={styles.customerLabel}>
                          Customer #{extractNumericIdFromGid(customer.id) ?? customer.id}
                        </div>
                        <div className={styles.customerControls}>
                          <button
                            type="button"
                            className={styles.detailsButton}
                            onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                          >
                            {isExpanded ? "Hide details" : "Details"}
                          </button>
                          {shopifyCustomerUrl ? (
                            <a
                              className={styles.detailsButton}
                              href={shopifyCustomerUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View in Shopify
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <s-badge tone={SEGMENT_TONE[customer.segment]}>{customer.segment}</s-badge>
                      </td>
                      <td>
                        <div className={styles.compactStat}>
                          {customer.orderCount} orders - ${fmtMoney(customer.totalSpent)} spent
                        </div>
                        <div className={styles.subtleText}>AOV ${fmtMoney(customer.averageOrderValue)}</div>
                      </td>
                      <td>
                        <div className={styles.compactStat}>
                          {customer.orderCount >= 2
                            ? `Usually every ${fmtDays(customer.avgOrderFrequencyDays)}d`
                            : "Purchase rhythm forming"}
                        </div>
                        <div className={styles.subtleTextRow}>
                          <span className={`${styles.delayPill} ${delayClass(customer.delayDays)}`}>
                            {delayLabel(customer.delayDays)}
                          </span>
                          <span className={styles.subtleText}>Last order {customer.daysSinceLastOrder}d ago</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.priorityCell}>
                          <span className={`${styles.priorityPill} ${PRIORITY_TONE_CLASS[customer.priority]}`}>
                            {customer.priority}
                          </span>
                          <div className={styles.subtleText}>
                            {customer.recoveryOpportunity > 0
                              ? `$${fmtMoney(customer.recoveryOpportunity)} opportunity`
                              : "Not urgent"}
                            {` - Risk ${customer.riskScore}`}
                          </div>
                        </div>
                      </td>
                      <td className={styles.actionText}>
                        <div className={styles.actionPrimary}>{customer.suggestedAction}</div>
                        <div className={styles.actionSecondary}>Why: {customer.whyFlagged}</div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className={styles.detailsRow}>
                        <td colSpan={6}>
                          <p className={styles.detailsText}>
                            <strong>Segment reasoning:</strong> {customer.explanation} Last order: {customer.lastOrderDate}. Expected
                            next order: {customer.expectedNextOrderDate}. Estimated recovery opportunity: $
                            {fmtMoney(customer.recoveryOpportunity)}.
                          </p>
                          <p className={styles.detailsText}>
                            <strong>Rule triggered:</strong> {customer.segmentRuleSummary}
                          </p>
                          <p className={styles.detailsText}>
                            <strong>Rule inputs:</strong> {customer.daysSinceLastOrder}d since last order, avg cadence{" "}
                            {customer.orderCount >= 2 ? `${fmtDays(customer.avgOrderFrequencyDays)}d` : "not established"}.
                            {customer.atRiskThresholdDays !== null
                              ? ` At-risk threshold ${fmtDays(customer.atRiskThresholdDays)}d, lost threshold ${fmtDays(customer.lostThresholdDays ?? 0)}d.`
                              : " At-risk/lost thresholds activate after 2+ orders."}
                          </p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
