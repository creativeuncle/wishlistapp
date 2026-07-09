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

  // Total distinct users (customers) who have at least one wishlist item
  const distinctUsers = await prisma.wishlistItem.findMany({
    where: { shop },
    distinct: ["customerId"],
    select: { customerId: true },
  });

  // Total distinct products present in any wishlist for this shop
  const distinctProducts = await prisma.wishlistItem.findMany({
    where: { shop },
    distinct: ["productId"],
    select: { productId: true },
  });

  // Total wishlist "adds" (rows), useful as a secondary stat
  const totalItems = await prisma.wishlistItem.count({ where: { shop } });

  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop, enabled: true },
  });

  return {
    totalUsers: distinctUsers.length,
    totalProducts: distinctProducts.length,
    totalItems,
    wishlistPageUrl: settings.wishlistPageUrl || null,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const result = await createWishlistPage(admin, session.shop);
    return { ok: true, pageUrl: result?.pageUrl, blockAdded: !!result?.blockAdded };
  } catch (error) {
    return { ok: false, error: error.message || "Something went wrong." };
  }
};

export default function Dashboard() {
  const { totalUsers, totalProducts, totalItems, wishlistPageUrl } =
    useLoaderData();
  const fetcher = useFetcher();
  const isCreating = fetcher.state !== "idle";
  const result = fetcher.data;
  const pageUrl = result?.ok ? result.pageUrl : wishlistPageUrl;

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
                  . The header heart icon on your storefront links here.
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
              {result?.ok && !result.blockAdded && (
                <Banner tone="warning">
                  Page created, but the wishlist block could not be added to
                  your theme automatically. Open the theme editor, open the
                  Wishlist page template, and add the "Wishlist Page" app
                  block manually.
                </Banner>
              )}
              <InlineStack gap="300">
                <Button onClick={() => fetcher.submit({}, { method: "post" })} loading={isCreating}>
                  {pageUrl ? "Re-create / repair wishlist page" : "Create Wishlist Page"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Total users using wishlist
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalUsers}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Total products in wishlists
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalProducts}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd" tone="subdued">
                  Total wishlist adds
                </Text>
                <Text as="p" variant="heading2xl">
                  {totalItems}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
