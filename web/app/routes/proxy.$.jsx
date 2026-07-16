import { authenticate, sendKlaviyoWishlistEvent } from "../shopify.server";
import prisma from "../db.server";

// Helper: always return JSON with CORS-safe headers for the storefront fetch()
function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

// GET /apps/wishlist/status                -> { enabled }
// GET /apps/wishlist/items?customerId=xxx  -> { items: [...] }
// POST /apps/wishlist/toggle               -> body: { customerId, productId, variantId, productHandle, productTitle, productImage, price }
//        returns { added: true|false, items: [...] }
export const loader = async ({ request }) => {
  // Verifies the Shopify app-proxy signature so only storefront requests
  // for this store are accepted.
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });

  const shop = session.shop;
  const url = new URL(request.url);
  const segment = url.pathname.split("/").pop();

  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop, enabled: true },
  });

  if (segment === "status") {
    return json({
      enabled: settings.enabled,
      wishlistPageUrl: settings.wishlistPageUrl || null,
      atcButton: {
        enabled: settings.atcButtonEnabled,
        addText: settings.atcButtonAddText,
        removeText: settings.atcButtonRemoveText,
        style: settings.atcButtonStyle,
        bgColor: settings.atcButtonBgColor,
        textColor: settings.atcButtonTextColor,
        cornerRadius: settings.atcButtonCornerRadius,
      },
    });
  }

  if (segment === "items") {
    if (!settings.enabled) return json({ items: [], enabled: false });
    const customerId = url.searchParams.get("customerId") || "";
    const items = await prisma.wishlistItem.findMany({
      where: { shop, customerId },
      orderBy: { createdAt: "desc" },
    });
    return json({ items, enabled: true });
  }

  return json({ error: "not_found" }, { status: 404 });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "unauthorized" }, { status: 401 });

  const shop = session.shop;
  const url = new URL(request.url);
  const segment = url.pathname.split("/").pop();

  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop, enabled: true },
  });

  if (!settings.enabled) {
    return json({ error: "wishlist_disabled" }, { status: 403 });
  }

  if (segment === "toggle" && request.method === "POST") {
    const body = await request.json();
    const {
      customerId,
      productId,
      variantId = null,
      productHandle,
      productTitle,
      productImage = null,
      price = null,
    } = body;

    if (!customerId || !productId || !productHandle || !productTitle) {
      return json({ error: "missing_fields" }, { status: 400 });
    }

    const existing = await prisma.wishlistItem.findUnique({
      where: {
        shop_customerId_productId_variantId: {
          shop,
          customerId,
          productId,
          variantId,
        },
      },
    });

    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      const items = await prisma.wishlistItem.findMany({
        where: { shop, customerId },
        orderBy: { createdAt: "desc" },
      });
      return json({ added: false, items });
    }

    await prisma.wishlistItem.create({
      data: {
        shop,
        customerId,
        productId,
        variantId,
        productHandle,
        productTitle,
        productImage,
        price,
      },
    });

    // Fire-and-forget: don't make the customer wait on Klaviyo's response.
    sendKlaviyoWishlistEvent(shop, customerId, {
      productTitle,
      productHandle,
      price,
    }).catch(() => {});

    const items = await prisma.wishlistItem.findMany({
      where: { shop, customerId },
      orderBy: { createdAt: "desc" },
    });
    return json({ added: true, items });
  }

  if (segment === "remove" && request.method === "POST") {
    const body = await request.json();
    const { customerId, productId, variantId = null } = body;
    await prisma.wishlistItem.deleteMany({
      where: { shop, customerId, productId, variantId },
    });
    const items = await prisma.wishlistItem.findMany({
      where: { shop, customerId },
      orderBy: { createdAt: "desc" },
    });
    return json({ items });
  }

  // Folds a guest's wishlist (built up before they logged in) into their
  // customer wishlist, once, the first time they load the storefront while
  // signed in with a leftover guest id still in localStorage.
  if (segment === "merge" && request.method === "POST") {
    const body = await request.json();
    const { guestId, customerId } = body;
    if (
      !guestId ||
      !customerId ||
      !guestId.startsWith("guest_") ||
      !customerId.startsWith("customer_")
    ) {
      return json({ error: "invalid_ids" }, { status: 400 });
    }

    const guestItems = await prisma.wishlistItem.findMany({
      where: { shop, customerId: guestId },
    });

    for (const item of guestItems) {
      const existing = await prisma.wishlistItem.findUnique({
        where: {
          shop_customerId_productId_variantId: {
            shop,
            customerId,
            productId: item.productId,
            variantId: item.variantId,
          },
        },
      });
      if (existing) {
        await prisma.wishlistItem.delete({ where: { id: item.id } });
      } else {
        await prisma.wishlistItem.update({
          where: { id: item.id },
          data: { customerId },
        });
      }
    }

    const items = await prisma.wishlistItem.findMany({
      where: { shop, customerId },
      orderBy: { createdAt: "desc" },
    });
    return json({ items });
  }

  return json({ error: "not_found" }, { status: 404 });
};
