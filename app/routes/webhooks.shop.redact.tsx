import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Session cleanup is safe and idempotent for current app storage.
  await db.session.deleteMany({ where: { shop } });

  // TODO: If non-session shop data is added later, extend cleanup here.
  return new Response();
};
