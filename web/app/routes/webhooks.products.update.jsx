import { authenticate, sendKlaviyoProductAlertEvent } from "../shopify.server";
import prisma from "../db.server";

// Fires on every product update. Checks whether any wishlisted variant for
// this product had a price drop or came back in stock, and if so pushes a
// Klaviyo event so the merchant can email the customer about it.
export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  const productId = `gid://shopify/Product/${payload.id}`;
  const items = await prisma.wishlistItem.findMany({
    where: { shop, productId },
  });
  if (items.length === 0) return new Response();

  const variants = payload.variants || [];

  for (const item of items) {
    const variantNumericId = item.variantId
      ? item.variantId.split("/").pop()
      : null;
    const variant = variantNumericId
      ? variants.find((v) => String(v.id) === variantNumericId)
      : variants[0];
    if (!variant) continue;

    const newPrice = variant.price != null ? String(variant.price) : item.price;
    const newAvailable =
      typeof variant.inventory_quantity === "number"
        ? variant.inventory_quantity > 0
        : item.available;

    const oldPrice = parseFloat(item.price);
    const parsedNewPrice = parseFloat(newPrice);
    const priceDropped =
      Number.isFinite(oldPrice) &&
      Number.isFinite(parsedNewPrice) &&
      parsedNewPrice < oldPrice;
    const backInStock = newAvailable && !item.available;

    const alertItem = {
      productTitle: item.productTitle,
      productHandle: item.productHandle,
      price: newPrice,
    };

    if (priceDropped) {
      sendKlaviyoProductAlertEvent(
        shop,
        item.customerId,
        "Wishlist Price Drop",
        alertItem,
      ).catch(() => {});
    }
    if (backInStock) {
      sendKlaviyoProductAlertEvent(
        shop,
        item.customerId,
        "Wishlist Back In Stock",
        alertItem,
      ).catch(() => {});
    }

    if (newPrice !== item.price || newAvailable !== item.available) {
      await prisma.wishlistItem.update({
        where: { id: item.id },
        data: { price: newPrice, available: newAvailable },
      });
    }
  }

  return new Response();
};
