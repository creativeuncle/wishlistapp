import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Mandatory GDPR webhook. A customer asked the store for the personal data
// this app holds about them. We don't have an automated delivery channel,
// so we log what we'd hand over - the merchant can pull it from here (or
// from the Dashboard's CSV export) within Shopify's 30-day window.
export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  const customerId = payload.customer?.id ? `customer_${payload.customer.id}` : null;
  if (customerId) {
    const items = await prisma.wishlistItem.findMany({
      where: { shop, customerId },
    });
    console.log(
      `[GDPR data_request] shop=${shop} customer=${customerId} wishlist_items=${JSON.stringify(items)}`,
    );
  }

  return new Response();
};
