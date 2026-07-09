import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October24,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.HOST || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      const settings = await prisma.shopSettings.upsert({
        where: { shop: session.shop },
        update: {},
        create: { shop: session.shop, enabled: true },
      });

      if (!settings.wishlistPageUrl) {
        try {
          const { admin } = await shopify.unauthenticated.admin(session.shop);
          await createWishlistPage(admin, session.shop);
        } catch (error) {
          console.error("Could not auto-create wishlist page:", error);
        }
      }
    },
  },
});

// `admin` is the GraphQL client returned by `authenticate.admin(request)` or
// `unauthenticated.admin(shop)` - both expose `.graphql(query, options)`.
export async function createWishlistPage(admin, shop) {
  const createPageResponse = await admin.graphql(
    `#graphql
    mutation CreateWishlistPage($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        page: {
          title: "Wishlist",
          handle: "wishlist",
          isPublished: true,
          body: "<div id=\"wishlist-page-placeholder\"></div>",
        },
      },
    },
  );
  const createPageJson = await createPageResponse.json();

  const page = createPageJson.data?.pageCreate?.page;
  const userErrors = createPageJson.data?.pageCreate?.userErrors || [];
  const handleTakenError = userErrors.find((e) =>
    e.message?.toLowerCase().includes("handle"),
  );

  const handle = page?.handle || (handleTakenError ? "wishlist" : null);
  if (!handle) {
    const message = userErrors[0]?.message || "Could not create the page.";
    throw new Error(message);
  }

  const pageUrl = `/pages/${handle}`;

  await prisma.shopSettings.update({
    where: { shop },
    data: { wishlistPageUrl: pageUrl },
  });

  return { pageUrl };
}

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;