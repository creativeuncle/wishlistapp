import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, InlineStack, Button } from "@shopify/polaris";
import { useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop, enabled: true },
  });
  return { enabled: settings.enabled };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const enabled = formData.get("enabled") === "true";

  await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: { enabled },
    create: { shop: session.shop, enabled },
  });

  return { enabled };
};

export default function Settings() {
  const { enabled } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const handleToggle = useCallback(() => {
    submit({ enabled: (!enabled).toString() }, { method: "post" });
  }, [enabled, submit]);

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Wishlist feature
              </Text>
              <Text as="p" tone="subdued">
                When disabled, the heart icon and wishlist page are hidden on
                your storefront for all customers.
              </Text>
              <InlineStack gap="300" align="start" blockAlign="center">
                <Button
                  variant={enabled ? "primary" : "secondary"}
                  tone={enabled ? "success" : undefined}
                  onClick={handleToggle}
                  loading={isSaving}
                >
                  {enabled ? "Enabled" : "Disabled"} — click to{" "}
                  {enabled ? "disable" : "enable"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
