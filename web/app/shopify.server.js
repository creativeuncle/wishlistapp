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
  // Deliberately NOT process.env.HOST - many hosts (Render included) reserve
  // that name for the server's own bind address, so setting it to a full
  // URL breaks the Node server itself with a DNS lookup error.
  appUrl: process.env.SHOPIFY_APP_URL || "",
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
  let grantedScopes = null;
  try {
    const scopesResponse = await admin.graphql(
      `#graphql
      query CurrentScopes { currentAppInstallation { accessScopes { handle } } }`,
    );
    const scopesJson = await scopesResponse.json();
    grantedScopes = (
      scopesJson.data?.currentAppInstallation?.accessScopes || []
    ).map((s) => s.handle);
  } catch (error) {
    grantedScopes = [`(could not check: ${error?.message || error})`];
  }

  let createPageResponse;
  try {
    createPageResponse = await admin.graphql(
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
  } catch (error) {
    if (error?.response?.code === 403 || /\b403\b/.test(String(error?.message))) {
      throw new Error(
        `Missing "write_content" permission. Currently granted scopes: ${grantedScopes?.join(", ") || "unknown"}. ` +
          "Uninstall and reinstall the app from Shopify Admin > Apps to grant the updated permissions, then try again.",
      );
    }
    throw error;
  }
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

// The extension's uid from extensions/wishlist/shopify.extension.toml,
// combined with the embed block's filename, identifies the "Wishlist"
// app embed block for theme-editor deep links and settings_data.json checks.
const APP_EMBED_ID = "234feb9f-8893-736d-284b-526fbb593a51121496b2/wishlist-embed";

// Looks at the live theme's config/settings_data.json to see whether the
// "Wishlist" app embed block has been switched on, and builds a deep link
// straight into the theme editor's app-embeds panel so merchants don't have
// to go hunt for it themselves.
export async function getAppEmbedStatus(admin, shop) {
  const themeResponse = await admin.graphql(
    `#graphql
    query ActiveTheme {
      themes(first: 1, roles: [MAIN]) {
        nodes { id }
      }
    }`,
  );
  const themeJson = await themeResponse.json();
  const themeGid = themeJson.data?.themes?.nodes?.[0]?.id;
  if (!themeGid) return { enabled: null, editorUrl: null };

  const themeId = themeGid.split("/").pop();
  const editorUrl = `https://${shop}/admin/themes/${themeId}/editor?context=apps&activateAppId=${APP_EMBED_ID}`;

  const assetResponse = await admin.graphql(
    `#graphql
    query ThemeSettings($id: ID!) {
      theme(id: $id) {
        files(filenames: ["config/settings_data.json"]) {
          nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { variables: { id: themeGid } },
  );
  const assetJson = await assetResponse.json();
  const content = assetJson.data?.theme?.files?.nodes?.[0]?.body?.content;
  if (!content) return { enabled: null, editorUrl };

  try {
    const settings = JSON.parse(content);
    const blocks = settings.current?.blocks || {};
    const block = Object.values(blocks).find((b) =>
      b.type?.includes("wishlist-embed"),
    );
    return { enabled: !!block && block.disabled !== true, editorUrl };
  } catch {
    return { enabled: null, editorUrl };
  }
}

// Pushes an event to Klaviyo for a logged-in customer, so the merchant can
// build discount/reminder flows in Klaviyo themselves. No-ops silently if
// the shop hasn't set a Klaviyo Private API Key, or if the wishlist item
// belongs to a guest (no email to identify them by).
async function sendKlaviyoEvent(shop, customerId, metricName, properties) {
  if (!customerId.startsWith("customer_")) return;

  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.klaviyoApiKey) return;

  try {
    const { admin } = await shopify.unauthenticated.admin(shop);
    const customerGid = `gid://shopify/Customer/${customerId.replace("customer_", "")}`;
    const customerResponse = await admin.graphql(
      `#graphql
      query CustomerEmail($id: ID!) {
        customer(id: $id) { email }
      }`,
      { variables: { id: customerGid } },
    );
    const customerJson = await customerResponse.json();
    const email = customerJson.data?.customer?.email;
    if (!email) return;

    await fetch("https://a.klaviyo.com/api/events/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Klaviyo-API-Key ${settings.klaviyoApiKey}`,
        revision: "2024-10-15",
      },
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            properties,
            metric: { data: { type: "metric", attributes: { name: metricName } } },
            profile: { data: { type: "profile", attributes: { email } } },
          },
        },
      }),
    });
  } catch (error) {
    console.error(`Could not send Klaviyo "${metricName}" event:`, error);
  }
}

export async function sendKlaviyoWishlistEvent(shop, customerId, item) {
  return sendKlaviyoEvent(shop, customerId, "Added to Wishlist", {
    ProductTitle: item.productTitle,
    ProductHandle: item.productHandle,
    Price: item.price,
  });
}

// Called from the products/update webhook when a wishlisted product's price
// drops or it comes back in stock, so merchants can build a Klaviyo flow
// that emails the customer about it.
export async function sendKlaviyoProductAlertEvent(shop, customerId, metricName, item) {
  return sendKlaviyoEvent(shop, customerId, metricName, {
    ProductTitle: item.productTitle,
    ProductHandle: item.productHandle,
    Price: item.price,
  });
}

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;