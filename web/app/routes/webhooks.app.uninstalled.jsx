import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, session } = await authenticate.webhook(request);

  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }
  await prisma.wishlistItem.deleteMany({ where: { shop } });
  await prisma.shopSettings.deleteMany({ where: { shop } });

  return new Response();
};
