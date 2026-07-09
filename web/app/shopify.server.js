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

  let blockAdded = false;
  try {
    blockAdded = await addAppBlockToPageTemplate(admin);
  } catch (error) {
    console.error("Could not auto-add app block to theme:", error);
  }

  return { pageUrl, blockAdded };
}

async function addAppBlockToPageTemplate(admin) {
  const themeResponse = await admin.graphql(
    `#graphql
    query ActiveTheme {
      themes(first: 1, roles: [MAIN]) {
        nodes { id }
      }
    }`,
  );
  const themeJson = await themeResponse.json();
  const themeId = themeJson.data?.themes?.nodes?.[0]?.id;
  if (!themeId) return;

  const assetResponse = await admin.graphql(
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
  const assetJson = await assetResponse.json();

  const fileNode = assetJson.data?.theme?.files?.nodes?.[0];
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
  if (alreadyAdded) return true;

  const blockKey = "wishlist_page_block";
  mainSection.blocks[blockKey] = {
    type: "shopify://apps/wishlist/blocks/wishlist-page/wishlist-page",
    settings: {},
  };
  mainSection.block_order.push(blockKey);

  const updateResponse = await admin.graphql(
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
  const updateJson = await updateResponse.json();

  const updateErrors = updateJson.data?.themeFilesUpsert?.userErrors || [];
  if (updateErrors.length) {
    throw new Error(updateErrors[0].message);
  }
  return true;
}

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;