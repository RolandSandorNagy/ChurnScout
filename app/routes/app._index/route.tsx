import { Fragment, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
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
  lastOrderDate: string;
  daysSinceLastOrder: number;
  avgOrderFrequencyDays: number;
  expectedNextOrderDate: string;
  delayDays: number;
  riskScore: number;
  suggestedAction: string;
}

const MOCK_CUSTOMERS: Customer[] = [
  { id: "1001", segment: "Lost", orderCount: 8, totalSpent: 1240.0, lastOrderDate: "Aug 16, 2025", daysSinceLastOrder: 270, avgOrderFrequencyDays: 45, expectedNextOrderDate: "Sep 30, 2025", delayDays: 225, riskScore: 96, suggestedAction: "Send 20% winback offer" },
  { id: "1002", segment: "Lost", orderCount: 3, totalSpent: 387.5, lastOrderDate: "Oct 15, 2025", daysSinceLastOrder: 210, avgOrderFrequencyDays: 63, expectedNextOrderDate: "Dec 17, 2025", delayDays: 147, riskScore: 91, suggestedAction: "Send winback email" },
  { id: "1003", segment: "Lost", orderCount: 5, totalSpent: 725.0, lastOrderDate: "Nov 14, 2025", daysSinceLastOrder: 180, avgOrderFrequencyDays: 52, expectedNextOrderDate: "Jan 5, 2026", delayDays: 128, riskScore: 88, suggestedAction: "Send winback email" },
  { id: "1004", segment: "At Risk", orderCount: 6, totalSpent: 892.0, lastOrderDate: "Jan 13, 2026", daysSinceLastOrder: 120, avgOrderFrequencyDays: 42, expectedNextOrderDate: "Feb 25, 2026", delayDays: 78, riskScore: 79, suggestedAction: "Send re-engagement email" },
  { id: "1005", segment: "At Risk", orderCount: 4, totalSpent: 534.0, lastOrderDate: "Feb 11, 2026", daysSinceLastOrder: 91, avgOrderFrequencyDays: 38, expectedNextOrderDate: "Mar 21, 2026", delayDays: 53, riskScore: 72, suggestedAction: "Offer loyalty discount" },
  { id: "1006", segment: "At Risk", orderCount: 2, totalSpent: 198.0, lastOrderDate: "Feb 20, 2026", daysSinceLastOrder: 82, avgOrderFrequencyDays: 35, expectedNextOrderDate: "Mar 27, 2026", delayDays: 47, riskScore: 68, suggestedAction: "Send re-engagement email" },
  { id: "1007", segment: "At Risk", orderCount: 7, totalSpent: 1105.0, lastOrderDate: "Mar 1, 2026", daysSinceLastOrder: 73, avgOrderFrequencyDays: 40, expectedNextOrderDate: "Apr 10, 2026", delayDays: 33, riskScore: 65, suggestedAction: "Offer loyalty discount" },
  { id: "1008", segment: "VIP", orderCount: 15, totalSpent: 4230.0, lastOrderDate: "May 1, 2026", daysSinceLastOrder: 12, avgOrderFrequencyDays: 20, expectedNextOrderDate: "May 21, 2026", delayDays: -8, riskScore: 8, suggestedAction: "Send VIP early access" },
  { id: "1009", segment: "VIP", orderCount: 11, totalSpent: 2980.0, lastOrderDate: "Apr 22, 2026", daysSinceLastOrder: 21, avgOrderFrequencyDays: 24, expectedNextOrderDate: "May 16, 2026", delayDays: -3, riskScore: 12, suggestedAction: "Send VIP early access" },
  { id: "1010", segment: "VIP", orderCount: 9, totalSpent: 2140.0, lastOrderDate: "Apr 10, 2026", daysSinceLastOrder: 33, avgOrderFrequencyDays: 30, expectedNextOrderDate: "May 10, 2026", delayDays: 3, riskScore: 18, suggestedAction: "Send VIP early access" },
  { id: "1011", segment: "Loyal", orderCount: 12, totalSpent: 1560.0, lastOrderDate: "Apr 28, 2026", daysSinceLastOrder: 15, avgOrderFrequencyDays: 26, expectedNextOrderDate: "May 24, 2026", delayDays: -11, riskScore: 22, suggestedAction: "Invite to loyalty program" },
  { id: "1012", segment: "Loyal", orderCount: 8, totalSpent: 940.0, lastOrderDate: "Mar 14, 2026", daysSinceLastOrder: 60, avgOrderFrequencyDays: 36, expectedNextOrderDate: "Apr 19, 2026", delayDays: 24, riskScore: 34, suggestedAction: "Invite to loyalty program" },
  { id: "1013", segment: "Repeat", orderCount: 3, totalSpent: 420.0, lastOrderDate: "Apr 15, 2026", daysSinceLastOrder: 28, avgOrderFrequencyDays: 31, expectedNextOrderDate: "May 16, 2026", delayDays: -3, riskScore: 29, suggestedAction: "Cross-sell related products" },
  { id: "1014", segment: "Repeat", orderCount: 2, totalSpent: 178.0, lastOrderDate: "Mar 25, 2026", daysSinceLastOrder: 49, avgOrderFrequencyDays: 29, expectedNextOrderDate: "Apr 23, 2026", delayDays: 20, riskScore: 41, suggestedAction: "Cross-sell related products" },
  { id: "1015", segment: "New", orderCount: 1, totalSpent: 89.0, lastOrderDate: "May 8, 2026", daysSinceLastOrder: 5, avgOrderFrequencyDays: 21, expectedNextOrderDate: "May 29, 2026", delayDays: -16, riskScore: 15, suggestedAction: "Send welcome series" },
  { id: "1016", segment: "New", orderCount: 1, totalSpent: 134.0, lastOrderDate: "May 5, 2026", daysSinceLastOrder: 8, avgOrderFrequencyDays: 21, expectedNextOrderDate: "May 26, 2026", delayDays: -13, riskScore: 20, suggestedAction: "Send welcome series" },
  { id: "1017", segment: "New", orderCount: 2, totalSpent: 245.0, lastOrderDate: "Apr 30, 2026", daysSinceLastOrder: 13, avgOrderFrequencyDays: 24, expectedNextOrderDate: "May 24, 2026", delayDays: -11, riskScore: 17, suggestedAction: "Send welcome series" },
];

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

function riskExplanation(customer: Customer) {
  if (customer.delayDays <= 0) {
    return `This customer usually orders every ${customer.avgOrderFrequencyDays} days and is currently on schedule. They have placed ${customer.orderCount} orders and spent $${fmtMoney(customer.totalSpent)}.`;
  }

  return `This customer usually orders every ${customer.avgOrderFrequencyDays} days, but has not ordered for ${customer.daysSinceLastOrder} days. They have placed ${customer.orderCount} orders and spent $${fmtMoney(customer.totalSpent)}, so they may be worth recovering.`;
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
  const highestValueLost = [...lost].sort((a, b) => b.totalSpent - a.totalSpent)[0];

  const filtered =
    activeTab === "All"
      ? MOCK_CUSTOMERS
      : MOCK_CUSTOMERS.filter((customer) => customer.segment === activeTab);

  const topPriorities = [
    `Win back Customer #${highestValueLost.id}, high-value lost customer, $${fmt(highestValueLost.totalSpent)} spent.`,
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
                      <td className={styles.numericCell}>Every {customer.avgOrderFrequencyDays}d</td>
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
                            <strong>Why this customer is at risk:</strong> {riskExplanation(customer)}
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
