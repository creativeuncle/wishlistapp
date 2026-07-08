import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, InlineGrid } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
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

  return {
    totalUsers: distinctUsers.length,
    totalProducts: distinctProducts.length,
    totalItems,
  };
};

export default function Dashboard() {
  const { totalUsers, totalProducts, totalItems } = useLoaderData();

  return (
    <Page title="Dashboard">
      <Layout>
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
