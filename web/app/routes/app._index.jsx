import { useState } from "react";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate, getAppEmbedStatus } from "../shopify.server";
import prisma from "../db.server";

const TREND_DAYS = 30;

// Builds an array of { date, count } for the last `days` days (oldest
// first), counting how many of the given timestamps fall on each day.
function bucketByDay(dates, days) {
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const date of dates) {
    const key = new Date(date).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const appEmbed = await getAppEmbedStatus(admin, shop).catch(() => ({
    enabled: null,
    editorUrl: null,
  }));

  const items = await prisma.wishlistItem.findMany({
    where: { shop },
    select: {
      customerId: true,
      productId: true,
      price: true,
      createdAt: true,
    },
  });

  const firstSeenByCustomer = new Map();
  const productIds = new Set();
  const valueByCustomer = new Map();
  let totalValue = 0;

  for (const item of items) {
    const price = parseFloat(item.price);
    const value = Number.isFinite(price) ? price : 0;
    totalValue += value;
    productIds.add(item.productId);
    valueByCustomer.set(
      item.customerId,
      (valueByCustomer.get(item.customerId) || 0) + value,
    );

    const existingFirst = firstSeenByCustomer.get(item.customerId);
    if (!existingFirst || item.createdAt < existingFirst) {
      firstSeenByCustomer.set(item.customerId, item.createdAt);
    }
  }

  const totalWishlists = firstSeenByCustomer.size;
  const averageWishlist = totalWishlists ? totalValue / totalWishlists : 0;

  const savedItemsTrend = bucketByDay(
    items.map((i) => i.createdAt),
    TREND_DAYS,
  );
  const newWishlistsTrend = bucketByDay(
    [...firstSeenByCustomer.values()],
    TREND_DAYS,
  );

  return {
    totalWishlists,
    totalProducts: productIds.size,
    totalValue,
    averageWishlist,
    savedItemsTrend,
    newWishlistsTrend,
    savedItemsLast30: savedItemsTrend.reduce((sum, d) => sum + d.count, 0),
    newWishlistsLast30: newWishlistsTrend.reduce((sum, d) => sum + d.count, 0),
    appStoreReviewUrl: process.env.APP_STORE_REVIEW_URL || null,
    appEmbedEnabled: appEmbed.enabled,
    appEmbedEditorUrl: appEmbed.editorUrl,
  };
};

function TrendChart({ title, total, data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="050">
          <Text as="h3" variant="headingMd" tone="subdued">
            {title}
          </Text>
          <Text as="p" variant="heading2xl">
            {total}
          </Text>
        </BlockStack>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 60,
          }}
        >
          {data.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.count}`}
              style={{
                flex: 1,
                minWidth: 2,
                height: `${Math.max(4, (d.count / max) * 100)}%`,
                background: d.count > 0 ? "#5c6ac4" : "#e4e5e7",
                borderRadius: 2,
              }}
            />
          ))}
        </div>
        <InlineStack align="space-between">
          <Text as="span" tone="subdued" variant="bodySm">
            {data[0]?.date}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {data[data.length - 1]?.date}
          </Text>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export default function Analytics() {
  const {
    totalWishlists,
    totalProducts,
    totalValue,
    averageWishlist,
    savedItemsTrend,
    newWishlistsTrend,
    savedItemsLast30,
    newWishlistsLast30,
    appStoreReviewUrl,
    appEmbedEnabled,
    appEmbedEditorUrl,
  } = useLoaderData();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <Page title="Analytics">
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
          <Text as="p" tone="subdued">
            Last {TREND_DAYS} days
          </Text>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <TrendChart
              title="New wishlists"
              total={newWishlistsLast30}
              data={newWishlistsTrend}
            />
            <TrendChart
              title="Saved items"
              total={savedItemsLast30}
              data={savedItemsTrend}
            />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Total wishlists
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalWishlists}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Products wishlisted
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalProducts}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Total value
                </Text>
                <Text as="p" variant="heading2xl">
                  ${totalValue.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Average wishlist
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
      <div style={{ height: 40 }} />
    </Page>
  );
}
