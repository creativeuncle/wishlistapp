import { useState } from "react";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate, createWishlistPage } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Every wishlist item for this shop, used to derive all the stats below
  const items = await prisma.wishlistItem.findMany({
    where: { shop },
    select: { customerId: true, productId: true, price: true },
  });

  const wishlistsByCustomer = new Map();
  const productIds = new Set();
  let totalValue = 0;

  for (const item of items) {
    productIds.add(item.productId);
    const price = parseFloat(item.price);
    const value = Number.isFinite(price) ? price : 0;
    totalValue += value;
    wishlistsByCustomer.set(
      item.customerId,
      (wishlistsByCustomer.get(item.customerId) || 0) + value,
    );
  }

  const totalWishlists = wishlistsByCustomer.size;
  const averageWishlist = totalWishlists
    ? totalValue / totalWishlists
    : 0;

  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop, enabled: true },
  });

  return {
    totalWishlists,
    totalProducts: productIds.size,
    totalValue,
    averageWishlist,
    wishlistPageUrl: settings.wishlistPageUrl || null,
    appStoreReviewUrl: process.env.APP_STORE_REVIEW_URL || null,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const result = await createWishlistPage(admin, session.shop);
    return { ok: true, pageUrl: result?.pageUrl };
  } catch (error) {
    return { ok: false, error: error.message || "Something went wrong." };
  }
};

export default function Dashboard() {
  const {
    totalWishlists,
    totalProducts,
    totalValue,
    averageWishlist,
    wishlistPageUrl,
    appStoreReviewUrl,
  } = useLoaderData();
  const fetcher = useFetcher();
  const isCreating = fetcher.state !== "idle";
  const result = fetcher.data;
  const pageUrl = result?.ok ? result.pageUrl : wishlistPageUrl;
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Wishlist page
              </Text>
              {pageUrl ? (
                <Text as="p" tone="subdued">
                  Your storefront wishlist page is live at{" "}
                  <Text as="span" fontWeight="semibold">
                    {pageUrl}
                  </Text>
                  . The header heart icon on your storefront links here, and
                  the products grid is injected automatically — no theme
                  editing needed.
                </Text>
              ) : (
                <Text as="p" tone="subdued">
                  No wishlist page yet — create one so the header heart icon
                  has somewhere to link to.
                </Text>
              )}
              {result && !result.ok && (
                <Banner tone="critical">{result.error}</Banner>
              )}
              {!pageUrl && (
                <InlineStack gap="300">
                  <Button onClick={() => fetcher.submit({}, { method: "post" })} loading={isCreating}>
                    Create Wishlist Page
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Wishlists
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalWishlists}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Products
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalProducts}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Total Value
                </Text>
                <Text as="p" variant="heading2xl">
                  ${totalValue.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Average Wishlist
                </Text>
                <Text as="p" variant="heading2xl">
                  ${averageWishlist.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap gap="400">
              <BlockStack gap="100">
                <Text as="h3" variant="headingMd">
                  How is your experience with the Wishlist?
                </Text>
                <Text as="p" tone="subdued">
                  {rating
                    ? appStoreReviewUrl
                      ? "Thanks! Taking you to the Shopify App Store to leave your review…"
                      : "Thanks for rating us!"
                    : "Rate us by clicking on the stars on the right."}
                </Text>
              </BlockStack>
              <InlineStack gap="100">
                {[1, 2, 3, 4, 5].map((value) => {
                  const filled = value <= (hoverRating || rating);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setRating(value);
                        if (appStoreReviewUrl) {
                          window.open(appStoreReviewUrl, "_blank", "noopener");
                        }
                      }}
                      onMouseEnter={() => setHoverRating(value)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`Rate ${value} out of 5 stars`}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: "28px",
                        lineHeight: 1,
                        color: filled ? "#ffa500" : "#d9d9d9",
                      }}
                    >
                      {filled ? "★" : "☆"}
                    </button>
                  );
                })}
              </InlineStack>
            </InlineStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
