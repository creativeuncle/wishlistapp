import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Mandatory GDPR webhook. Delete everything we hold for this customer.
export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  const customerId = payload.customer?.id ? `customer_${payload.customer.id}` : null;
  if (customerId) {
    await prisma.wishlistItem.deleteMany({ where: { shop, customerId } });
  }

  return new Response();
};
