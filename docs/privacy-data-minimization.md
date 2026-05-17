# Privacy and Data Minimization (MVP)

ChurnScout reads Shopify order history to calculate retention and churn-risk metrics.

For the MVP, ChurnScout intentionally minimizes data access and retention:

- Reads only the order fields needed for in-memory churn calculations: `processedAt`, order total amount, and `customer.id`.
- Does **not** fetch or store customer names, emails, addresses, phone numbers, or raw Shopify order/customer JSON.
- Uses the minimum required Admin API scope for this flow (`read_orders`) and avoids unnecessary scopes.

