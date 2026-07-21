import { useMemo, useState } from "react";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const items = await prisma.wishlistItem.findMany({
    where: { shop },
    select: { customerId: true, price: true, createdAt: true },
  });

  const byCustomer = new Map();
  for (const item of items) {
    const price = parseFloat(item.price);
    const value = Number.isFinite(price) ? price : 0;
    const existing = byCustomer.get(item.customerId);
    if (existing) {
      existing.count += 1;
      existing.totalValue += value;
      if (item.createdAt < existing.firstSeen) existing.firstSeen = item.createdAt;
    } else {
      byCustomer.set(item.customerId, {
        customerId: item.customerId,
        count: 1,
        totalValue: value,
        firstSeen: item.createdAt,
      });
    }
  }

  const customerGids = [...byCustomer.keys()]
    .filter((id) => id.startsWith("customer_"))
    .map((id) => `gid://shopify/Customer/${id.replace("customer_", "")}`);

  const emailByGid = {};
  if (customerGids.length) {
    try {
      const response = await admin.graphql(
        `#graphql
        query CustomerEmails($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Customer { id email }
          }
        }`,
        { variables: { ids: customerGids } },
      );
      const json = await response.json();
      for (const node of json.data?.nodes || []) {
        if (node?.id) emailByGid[node.id] = node.email || "";
      }
    } catch {
      /* fall back to showing raw ids below */
    }
  }

  let totalCustomers = null;
  try {
    const response = await admin.graphql(
      `#graphql
      query CustomersCount { customersCount { count } }`,
    );
    const json = await response.json();
    totalCustomers = json.data?.customersCount?.count ?? null;
  } catch {
    /* percentage just won't be shown */
  }

  const customers = [...byCustomer.values()]
    .map((c) => {
      const isGuest = c.customerId.startsWith("guest_");
      const gid = isGuest
        ? ""
        : `gid://shopify/Customer/${c.customerId.replace("customer_", "")}`;
      return {
        ...c,
        label: isGuest ? "Guest visitor" : emailByGid[gid] || c.customerId,
      };
    })
    .sort((a, b) => b.firstSeen - a.firstSeen);

  return {
    customers,
    totalCustomers,
  };
};

export default function Customers() {
  const { customers, totalCustomers } = useLoaderData();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.label.toLowerCase().includes(q));
  }, [customers, search]);

  const percentage =
    totalCustomers && totalCustomers > 0
      ? ((customers.length / totalCustomers) * 100).toFixed(1)
      : null;

  const rows = filtered.map((c) => [
    c.label,
    String(c.count),
    `$${c.totalValue.toFixed(2)}`,
    new Date(c.firstSeen).toLocaleDateString(),
  ]);

  return (
    <Page title="Customers">
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" fontWeight="semibold">
                {customers.length} Customer Wishlists
              </Text>
              {percentage !== null && (
                <Text as="span" tone="subdued">
                  {percentage}% of your customer base
                </Text>
              )}
            </InlineStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <TextField
                label="Search customer"
                labelHidden
                placeholder="Search customer"
                prefix="🔍"
                value={search}
                onChange={setSearch}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSearch("")}
              />

              {filtered.length === 0 ? (
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="p" tone="subdued" alignment="center">
                    {customers.length === 0
                      ? "No customer wishlists found. Get started by creating your first wishlist."
                      : "No customers match your search."}
                  </Text>
                </BlockStack>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "text"]}
                  headings={["Customer", "Items", "Total value", "First saved"]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      <div style={{ height: 40 }} />
    </Page>
  );
}
