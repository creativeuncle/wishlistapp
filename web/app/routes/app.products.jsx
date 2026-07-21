import { useCallback, useMemo, useState } from "react";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const items = await prisma.wishlistItem.findMany({
    where: { shop },
    select: {
      productId: true,
      productTitle: true,
      productHandle: true,
      productImage: true,
      price: true,
      customerId: true,
    },
  });

  const byProduct = new Map();
  for (const item of items) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      existing.customers.add(item.customerId);
    } else {
      byProduct.set(item.productId, {
        productId: item.productId,
        title: item.productTitle,
        handle: item.productHandle,
        image: item.productImage,
        price: item.price,
        customers: new Set([item.customerId]),
      });
    }
  }

  const products = [...byProduct.values()]
    .map((p) => ({
      productId: p.productId,
      title: p.title,
      handle: p.handle,
      image: p.image,
      price: p.price,
      wishlistCount: p.customers.size,
    }))
    .sort((a, b) => b.wishlistCount - a.wishlistCount);

  return { products };
};

export default function Products() {
  const { products } = useLoaderData();
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.title.toLowerCase().includes(q));
  }, [products, search]);

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/app/export-csv");
      if (!response.ok) throw new Error("export_failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wishlist-export-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* silently ignore - the button just stops loading */
    } finally {
      setIsExporting(false);
    }
  }, []);

  return (
    <Page title="Products">
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" fontWeight="semibold">
                {products.length} products (wishlisted by at least one customer)
              </Text>
              <Button onClick={handleExportCsv} loading={isExporting}>
                Export CSV
              </Button>
            </InlineStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <TextField
                label="Search products"
                labelHidden
                placeholder="Search products"
                prefix="🔍"
                value={search}
                onChange={setSearch}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSearch("")}
              />

              {filtered.length === 0 ? (
                <Text as="p" tone="subdued" alignment="center">
                  {products.length === 0
                    ? "None of your customers has saved a wishlist product yet."
                    : "No products match your search."}
                </Text>
              ) : (
                <BlockStack gap="200">
                  {filtered.map((product) => (
                    <InlineStack
                      key={product.productId}
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
                        <BlockStack gap="0">
                          <Text as="span">{product.title}</Text>
                          {product.price && (
                            <Text as="span" tone="subdued" variant="bodySm">
                              ${product.price}
                            </Text>
                          )}
                        </BlockStack>
                      </InlineStack>
                      <Text as="span" tone="subdued">
                        {product.wishlistCount}{" "}
                        {product.wishlistCount === 1 ? "wishlist" : "wishlists"}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      <div style={{ height: 40 }} />
    </Page>
  );
}
