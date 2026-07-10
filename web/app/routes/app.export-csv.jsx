import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const items = await prisma.wishlistItem.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  const customerGids = [
    ...new Set(
      items
        .filter((item) => item.customerId.startsWith("customer_"))
        .map(
          (item) =>
            `gid://shopify/Customer/${item.customerId.replace("customer_", "")}`,
        ),
    ),
  ];

  const emailByGid = {};
  if (customerGids.length) {
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
  }

  const header = [
    "Customer Type",
    "Customer Email",
    "Product Title",
    "Product Handle",
    "Price",
    "Added At",
  ];

  const rows = items.map((item) => {
    const isGuest = item.customerId.startsWith("guest_");
    const gid = isGuest
      ? ""
      : `gid://shopify/Customer/${item.customerId.replace("customer_", "")}`;
    return [
      isGuest ? "Guest" : "Customer",
      isGuest ? "" : emailByGid[gid] || "",
      item.productTitle,
      item.productHandle,
      item.price || "",
      item.createdAt.toISOString(),
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="wishlist-export-${Date.now()}.csv"`,
    },
  });
};
