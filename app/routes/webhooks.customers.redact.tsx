import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const customerId = payload.customer?.id ?? null;

  console.log(
    `Received ${topic} webhook for ${shop}${customerId ? ` (customerId=${customerId})` : ""}`,
  );

  // ChurnScout MVP does not persist raw customer/order records.
  return new Response();
};
