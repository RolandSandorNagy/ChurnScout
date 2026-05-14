import { Fragment, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { calculateCustomerMetrics, type CustomerSegment } from "../../domain/customerMetrics";
import { MOCK_CUSTOMER_ORDER_HISTORIES, MOCK_METRICS_NOW } from "./mockCustomerOrderHistories";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type Segment = "At Risk" | "Lost" | "VIP" | "Loyal" | "Repeat" | "New";
type BadgeTone = "info" | "success" | "warning" | "critical" | "caution" | "neutral" | "auto";
type Tab = "All" | Segment;

interface Customer {
  id: string;
  segment: Segment;
  orderCount: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate: string;
  daysSinceLastOrder: number;
  avgOrderFrequencyDays: number;
  expectedNextOrderDate: string;
  delayDays: number;
  riskScore: number;
  explanation: string;
  suggestedAction: string;
}

function toUiSegment(segment: CustomerSegment): Segment {
  if (segment === "AT_RISK") return "At Risk";
  if (segment === "LOST") return "Lost";
  if (segment === "VIP") return "VIP";
  if (segment === "LOYAL") return "Loyal";
  if (segment === "REPEAT") return "Repeat";
  return "New";
}

function suggestedActionForSegment(segment: Segment): string {
  if (segment === "Lost") return "Send winback email";
  if (segment === "At Risk") return "Send re-engagement email";
  if (segment === "VIP") return "Send VIP early access";
  if (segment === "Loyal") return "Invite to loyalty program";
  if (segment === "Repeat") return "Cross-sell related products";
  return "Send welcome series";
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

const MOCK_CUSTOMERS: Customer[] = MOCK_CUSTOMER_ORDER_HISTORIES.map((history) => {
  const metrics = calculateCustomerMetrics(history, { now: MOCK_METRICS_NOW });
  const segment = toUiSegment(metrics.segment);

  return {
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
    suggestedAction: suggestedActionForSegment(segment),
  };
});

const TABS: Tab[] = ["All", "At Risk", "Lost", "VIP", "Loyal", "Repeat", "New"];

const SEGMENT_TONE: Record<Segment, BadgeTone> = {
  "At Risk": "warning",
  Lost: "critical",
  VIP: "caution",
  Loyal: "success",
  Repeat: "info",
  New: "info",
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function riskClass(score: number) {
  if (score <= 30) return styles.riskLow;
  if (score <= 60) return styles.riskMedium;
  if (score <= 80) return styles.riskHigh;
  return styles.riskCritical;
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

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  const atRisk = MOCK_CUSTOMERS.filter((c) => c.segment === "At Risk");
  const lost = MOCK_CUSTOMERS.filter((c) => c.segment === "Lost");
  const vip = MOCK_CUSTOMERS.filter((c) => c.segment === "VIP");
  const repeat = MOCK_CUSTOMERS.filter((c) => c.segment === "Repeat");

  const revenueAtRisk = [...atRisk, ...lost].reduce((sum, customer) => sum + customer.totalSpent, 0);
  const atRiskRevenue = atRisk.reduce((sum, customer) => sum + customer.totalSpent, 0);
  const highestValueLost = [...lost].sort((a, b) => b.totalSpent - a.totalSpent)[0] ?? null;

  const filtered =
    activeTab === "All"
      ? MOCK_CUSTOMERS
      : MOCK_CUSTOMERS.filter((customer) => customer.segment === activeTab);

  const topPriorities = [
    highestValueLost
      ? `Win back Customer #${highestValueLost.id}, high-value lost customer, $${fmt(highestValueLost.totalSpent)} spent.`
      : "No lost customers right now. Focus on preventing at-risk churn this week.",
    `Send re-engagement email to ${atRisk.length} at-risk customers (${fmt(atRiskRevenue)} at-risk revenue).`,
    `Invite ${vip.length} VIP customers to an early access campaign.`,
    `Nudge ${repeat.length} repeat customers with a cross-sell offer before they slow down.`,
  ];

  return (
    <s-page heading="ChurnScout">
      <p className={styles.subtitle}>
        Detect at-risk customers and customer winback opportunities from Shopify order history.
      </p>

      <s-section heading="Overview">
        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <div className={styles.cardValue}>{MOCK_CUSTOMERS.length}</div>
            <div className={styles.cardLabel}>Customers analyzed</div>
          </div>
          <div className={`${styles.card} ${styles.cardWarning}`}>
            <div className={styles.cardValue}>{atRisk.length}</div>
            <div className={styles.cardLabel}>At-risk customers</div>
          </div>
          <div className={`${styles.card} ${styles.cardCritical}`}>
            <div className={styles.cardValue}>{lost.length}</div>
            <div className={styles.cardLabel}>Lost customers</div>
          </div>
          <div className={`${styles.card} ${styles.cardSuccess}`}>
            <div className={styles.cardValue}>{vip.length}</div>
            <div className={styles.cardLabel}>VIP customers</div>
          </div>
          <div className={`${styles.card} ${styles.cardWarning}`}>
            <div className={styles.cardValue}>${fmt(revenueAtRisk)}</div>
            <div className={styles.cardLabel}>Estimated revenue at risk</div>
          </div>
        </div>
      </s-section>

      <s-section heading="This week's insight">
        <div className={styles.insightBox}>
          <div className={styles.insightBody}>
            <p>
              Focus this week on your <strong>{atRisk.length} at-risk customers</strong>, especially high spenders
              with 90+ days since their last order. A targeted winback message could protect about <strong>${fmt(atRiskRevenue)}</strong>{" "}
              in near-term revenue before these customers move into the lost segment.
            </p>
            <p>
              Also run a separate winback campaign for your <strong>{lost.length} lost customers</strong>.
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
          ChurnScout compares each customer's usual purchase rhythm with the time since their last order. Customers are
          marked at risk when they are significantly overdue based on their own buying pattern.
        </div>
      </s-section>

      <s-section heading="Customers">
        <div className={styles.mockActions}>
          <button type="button" className={styles.mockActionButton} disabled>
            View in Shopify
          </button>
          <button type="button" className={styles.mockActionButton} disabled>
            Create segment
          </button>
          <button type="button" className={styles.mockActionButton} disabled>
            Export CSV
          </button>
          <button type="button" className={styles.mockActionButton} disabled>
            Tag customers
          </button>
          <button type="button" className={styles.mockActionButton} disabled>
            Send to Klaviyo
          </button>
        </div>
        <p className={styles.mockActionNote}>Mock actions only. Coming soon.</p>

        <div className={styles.tabs}>
          {TABS.map((tab) => {
            const count =
              tab === "All"
                ? MOCK_CUSTOMERS.length
                : MOCK_CUSTOMERS.filter((customer) => customer.segment === tab).length;
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

        <p className={styles.filterNote}>Filters are applied locally to mock data in this MVP prototype.</p>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Segment</th>
                <th>Orders</th>
                <th>Total spent</th>
                <th>Last order</th>
                <th>
                  Avg. freq
                  <span
                    className={styles.helpHint}
                    title="Based on the average number of days between this customer's previous orders."
                  >
                    ?
                  </span>
                </th>
                <th>Next order</th>
                <th>Delay</th>
                <th>Risk</th>
                <th>Action</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const isExpanded = expandedCustomerId === customer.id;

                return (
                  <Fragment key={customer.id}>
                    <tr>
                      <td className={styles.customerLabel}>Customer #{customer.id}</td>
                      <td>
                        <s-badge tone={SEGMENT_TONE[customer.segment]}>{customer.segment}</s-badge>
                      </td>
                      <td className={styles.numericCell}>{customer.orderCount}</td>
                      <td className={styles.numericCell}>${fmtMoney(customer.totalSpent)}</td>
                      <td className={styles.numericCell}>{customer.lastOrderDate}</td>
                      <td className={styles.numericCell}>Every {fmtDays(customer.avgOrderFrequencyDays)}d</td>
                      <td className={styles.numericCell}>{customer.expectedNextOrderDate}</td>
                      <td>
                        <span className={`${styles.delayPill} ${delayClass(customer.delayDays)}`}>
                          {delayLabel(customer.delayDays)}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.riskScore} ${riskClass(customer.riskScore)}`}>{customer.riskScore}</span>
                      </td>
                      <td className={styles.actionText}>{customer.suggestedAction}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.detailsButton}
                          onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                        >
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className={styles.detailsRow}>
                        <td colSpan={11}>
                          <p className={styles.detailsText}>
                            <strong>Segment reasoning:</strong> {customer.explanation} Average order value: $
                            {fmtMoney(customer.averageOrderValue)}.
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
