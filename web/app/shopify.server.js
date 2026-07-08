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
          await createWishlistPage(session);
        } catch (error) {
          console.error("Could not auto-create wishlist page:", error);
        }
      }
    },
  },
});

async function createWishlistPage(session) {
  const client = new shopify.api.clients.Graphql({ session });

  const createPageResponse = await client.request(
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

  const page = createPageResponse.data?.pageCreate?.page;
  const userErrors = createPageResponse.data?.pageCreate?.userErrors || [];
  const handleTakenError = userErrors.find((e) =>
    e.message?.toLowerCase().includes("handle"),
  );

  const handle = page?.handle || (handleTakenError ? "wishlist" : null);
  if (!handle) return;

  const pageUrl = `/pages/${handle}`;

  await prisma.shopSettings.update({
    where: { shop: session.shop },
    data: { wishlistPageUrl: pageUrl },
  });

  try {
    await addAppBlockToPageTemplate(client);
  } catch (error) {
    console.error("Could not auto-add app block to theme:", error);
  }
}

async function addAppBlockToPageTemplate(client) {
  const themeResponse = await client.request(
    `#graphql
    query ActiveTheme {
      themes(first: 1, roles: [MAIN]) {
        nodes { id }
      }
    }`,
  );
  const themeId = themeResponse.data?.themes?.nodes?.[0]?.id;
  if (!themeId) return;

  const assetResponse = await client.request(
    `#graphql
    query ThemeAsset($id: ID!, $filename: String!) {
      theme(id: $id) {
        files(filenames: [$filename]) {
          nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { variables: { id: themeId, filename: "templates/page.json" } },
  );

  const fileNode = assetResponse.data?.theme?.files?.nodes?.[0];
  if (!fileNode?.body?.content) return;

  const templateJson = JSON.parse(fileNode.body.content);
  const mainSectionKey = Object.keys(templateJson.sections || {}).find(
    (key) => templateJson.sections[key]?.type?.includes("main-page"),
  );
  if (!mainSectionKey) return;

  const mainSection = templateJson.sections[mainSectionKey];
  mainSection.blocks = mainSection.blocks || {};
  mainSection.block_order = mainSection.block_order || [];

  const alreadyAdded = Object.values(mainSection.blocks).some((block) =>
    block.type?.includes("wishlist-page"),
  );
  if (alreadyAdded) return;

  const blockKey = "wishlist_page_block";
  mainSection.blocks[blockKey] = {
    type: "shopify://apps/wishlist/blocks/wishlist-page/wishlist-page",
    settings: {},
  };
  mainSection.block_order.push(blockKey);

  await client.request(
    `#graphql
    mutation UpdateTemplate($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        themeId,
        files: [
          {
            filename: "templates/page.json",
            body: {
              type: "TEXT",
              value: JSON.stringify(templateJson, null, 2),
            },
          },
        ],
      },
    },
  );
}

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;