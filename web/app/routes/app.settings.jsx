import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Button,
  TextField,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop, enabled: true },
  });
  return {
    enabled: settings.enabled,
    hasKlaviyoApiKey: !!settings.klaviyoApiKey,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  if (intent === "klaviyo") {
    const klaviyoApiKey = formData.get("klaviyoApiKey")?.toString().trim() || null;
    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: { klaviyoApiKey },
      create: { shop: session.shop, enabled: true, klaviyoApiKey },
    });
    return { hasKlaviyoApiKey: !!klaviyoApiKey };
  }

  const enabled = formData.get("enabled") === "true";
  await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    update: { enabled },
    create: { shop: session.shop, enabled },
  });

  return { enabled };
};

export default function Settings() {
  const { enabled, hasKlaviyoApiKey } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const [klaviyoApiKey, setKlaviyoApiKey] = useState("");

  const handleToggle = useCallback(() => {
    submit({ _action: "toggle", enabled: (!enabled).toString() }, { method: "post" });
  }, [enabled, submit]);

  const handleSaveKlaviyo = useCallback(() => {
    submit({ _action: "klaviyo", klaviyoApiKey }, { method: "post" });
  }, [klaviyoApiKey, submit]);

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
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Klaviyo integration
              </Text>
              <Text as="p" tone="subdued">
                Paste your Klaviyo Private API Key to automatically send an
                "Added to Wishlist" event whenever a logged-in customer adds
                a product. Use this event in Klaviyo to build discount or
                reminder email flows.{" "}
                {hasKlaviyoApiKey && "A key is currently saved."}
              </Text>
              <TextField
                label="Klaviyo Private API Key"
                labelHidden
                type="password"
                autoComplete="off"
                placeholder={hasKlaviyoApiKey ? "•••••••••••• (saved)" : "pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                value={klaviyoApiKey}
                onChange={setKlaviyoApiKey}
              />
              <InlineStack gap="300" align="start">
                <Button onClick={handleSaveKlaviyo} loading={isSaving}>
                  Save Klaviyo key
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
