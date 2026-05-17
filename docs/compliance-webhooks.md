# Compliance Webhooks

Shopify requires public/App Store apps to register and handle privacy/compliance webhooks so merchants and customers can exercise data rights requests.

For ChurnScout MVP:

- The app does **not** persist raw Shopify customer or order records in its database.
- The app stores installation/session data used for authentication.

## Registered Compliance Topics

- `customers/data_request` -> `/webhooks/customers/data_request`
- `customers/redact` -> `/webhooks/customers/redact`
- `shop/redact` -> `/webhooks/shop/redact`

These are configured in `shopify.app.toml` using `compliance_topics` subscriptions.

## Handler Behavior

- `customers/data_request`
  - Authenticates the webhook with the Shopify template's `authenticate.webhook`.
  - Logs a minimal safe message (`topic`, `shop`, optional `customerId`).
  - Returns HTTP `200`.
  - No customer/order export action is needed in MVP because raw records are not stored.

- `customers/redact`
  - Authenticates with `authenticate.webhook`.
  - Logs a minimal safe message (`topic`, `shop`, optional `customerId`).
  - Returns HTTP `200`.
  - No customer deletion is needed in MVP because raw records are not stored.

- `shop/redact`
  - Authenticates with `authenticate.webhook`.
  - Logs a minimal safe message (`topic`, `shop`).
  - Returns HTTP `200`.
  - Deletes app sessions for the shop (safe/idempotent cleanup for current storage model).
  - Includes a TODO note to extend cleanup if non-session shop data is added later.

## Logging and Data Safety

- Handlers do not log full webhook payloads.
- Handlers do not log customer email/address or other raw personal data.

## Testing and Deployment Notes

- Local verification:
  - Build: `npm run build`
  - Domain tests: `npm run test:domain`
- Deploy configuration with webhook subscriptions:
  - `shopify app deploy`
- Validate endpoint registration and delivery in Partner Dashboard / app logs after deployment.
