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
import { authenticate, createWishlistPage, getAppEmbedStatus } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const appEmbed = await getAppEmbedStatus(admin, shop).catch(() => ({
    enabled: null,
    editorUrl: null,
  }));

  // Every wishlist item for this shop, used to derive all the stats below
  const items = await prisma.wishlistItem.findMany({
    where: { shop },
    select: {
      customerId: true,
      productId: true,
      price: true,
      productTitle: true,
      productImage: true,
    },
  });

  const wishlistsByCustomer = new Map();
  const productStats = new Map();
  let totalValue = 0;

  for (const item of items) {
    const price = parseFloat(item.price);
    const value = Number.isFinite(price) ? price : 0;
    totalValue += value;
    wishlistsByCustomer.set(
      item.customerId,
      (wishlistsByCustomer.get(item.customerId) || 0) + value,
    );

    const existing = productStats.get(item.productId);
    if (existing) {
      existing.count += 1;
    } else {
      productStats.set(item.productId, {
        count: 1,
        title: item.productTitle,
        image: item.productImage,
      });
    }
  }

  const totalWishlists = wishlistsByCustomer.size;
  const averageWishlist = totalWishlists
    ? totalValue / totalWishlists
    : 0;

  const topProducts = [...productStats.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop, enabled: true },
  });

  return {
    totalWishlists,
    totalProducts: productStats.size,
    totalValue,
    averageWishlist,
    topProducts,
    wishlistPageUrl: settings.wishlistPageUrl || null,
    appStoreReviewUrl: process.env.APP_STORE_REVIEW_URL || null,
    appEmbedEnabled: appEmbed.enabled,
    appEmbedEditorUrl: appEmbed.editorUrl,
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
    topProducts,
    wishlistPageUrl,
    appStoreReviewUrl,
    appEmbedEnabled,
    appEmbedEditorUrl,
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
        {appEmbedEnabled === false && appEmbedEditorUrl && (
          <Layout.Section>
            <Banner
              title="Wishlist isn't visible on your store yet"
              tone="warning"
              action={{
                content: "Add Wishlist to your theme",
                url: appEmbedEditorUrl,
                target: "_top",
              }}
            >
              <Text as="p">
                Enable Wishlist in your theme editor and click save.
              </Text>
            </Banner>
          </Layout.Section>
        )}
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
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Most wishlisted products
                </Text>
                <Button url="/app/export-csv" target="_blank">
                  Export CSV
                </Button>
              </InlineStack>
              {topProducts.length === 0 ? (
                <Text as="p" tone="subdued">
                  No wishlist activity yet.
                </Text>
              ) : (
                <BlockStack gap="200">
                  {topProducts.map((product, index) => (
                    <InlineStack
                      key={product.title + index}
                      align="space-between"
                      blockAlign="center"
                      gap="300"
                    >
                      <InlineStack gap="300" blockAlign="center">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.title}
                            style={{
                              width: 40,
                              height: 40,
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 6,
                              background: "#f1f1f1",
                            }}
                          />
                        )}
                        <Text as="span">{product.title}</Text>
                      </InlineStack>
                      <Text as="span" tone="subdued">
                        {product.count} {product.count === 1 ? "wishlist" : "wishlists"}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
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
