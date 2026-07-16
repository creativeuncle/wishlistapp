import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Mandatory GDPR webhook. Fires 48 hours after a shop uninstalls the app -
// delete everything for that shop, same cleanup as app/uninstalled.
export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);

  await prisma.session.deleteMany({ where: { shop } });
  await prisma.wishlistItem.deleteMany({ where: { shop } });
  await prisma.shopSettings.deleteMany({ where: { shop } });

  return new Response();
};
