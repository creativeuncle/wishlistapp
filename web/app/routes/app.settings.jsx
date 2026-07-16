import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Button,
  ButtonGroup,
  Checkbox,
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
    atcButton: {
      enabled: settings.atcButtonEnabled,
      addText: settings.atcButtonAddText,
      removeText: settings.atcButtonRemoveText,
      style: settings.atcButtonStyle,
      bgColor: settings.atcButtonBgColor,
      textColor: settings.atcButtonTextColor,
      cornerRadius: settings.atcButtonCornerRadius,
    },
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

  if (intent === "atcButton") {
    const data = {
      atcButtonEnabled: formData.get("atcButtonEnabled") === "true",
      atcButtonAddText: formData.get("atcButtonAddText")?.toString() || "Add to Wishlist",
      atcButtonRemoveText: formData.get("atcButtonRemoveText")?.toString() || "Remove from Wishlist",
      atcButtonStyle: formData.get("atcButtonStyle")?.toString() === "outline" ? "outline" : "filled",
      atcButtonBgColor: formData.get("atcButtonBgColor")?.toString() || "#222222",
      atcButtonTextColor: formData.get("atcButtonTextColor")?.toString() || "#FFFFFF",
      atcButtonCornerRadius: parseInt(formData.get("atcButtonCornerRadius"), 10) || 0,
    };
    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: data,
      create: { shop: session.shop, enabled: true, ...data },
    });
    return { atcButtonSaved: true };
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
  const { enabled, hasKlaviyoApiKey, atcButton } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const [klaviyoApiKey, setKlaviyoApiKey] = useState("");

  const [atcEnabled, setAtcEnabled] = useState(atcButton.enabled);
  const [addText, setAddText] = useState(atcButton.addText);
  const [removeText, setRemoveText] = useState(atcButton.removeText);
  const [style, setStyle] = useState(atcButton.style);
  const [bgColor, setBgColor] = useState(atcButton.bgColor);
  const [textColor, setTextColor] = useState(atcButton.textColor);
  const [cornerRadius, setCornerRadius] = useState(String(atcButton.cornerRadius));

  const handleToggle = useCallback(() => {
    submit({ _action: "toggle", enabled: (!enabled).toString() }, { method: "post" });
  }, [enabled, submit]);

  const handleSaveKlaviyo = useCallback(() => {
    submit({ _action: "klaviyo", klaviyoApiKey }, { method: "post" });
  }, [klaviyoApiKey, submit]);

  const handleSaveAtcButton = useCallback(() => {
    submit(
      {
        _action: "atcButton",
        atcButtonEnabled: atcEnabled.toString(),
        atcButtonAddText: addText,
        atcButtonRemoveText: removeText,
        atcButtonStyle: style,
        atcButtonBgColor: bgColor,
        atcButtonTextColor: textColor,
        atcButtonCornerRadius: cornerRadius,
      },
      { method: "post" },
    );
  }, [atcEnabled, addText, removeText, style, bgColor, textColor, cornerRadius, submit]);

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

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Add to Wishlist button
                </Text>
                <Text as="p" tone="subdued">
                  Customize the add and remove Wishlist buttons on product
                  pages.
                </Text>
              </BlockStack>

              <Checkbox
                label="Show the Add to Wishlist button below the Add to Cart button on the product page"
                checked={atcEnabled}
                onChange={setAtcEnabled}
              />

              <TextField
                label="Add to Wishlist button text"
                value={addText}
                onChange={setAddText}
                autoComplete="off"
              />

              <BlockStack gap="100">
                <TextField
                  label="Remove from Wishlist button text"
                  value={removeText}
                  onChange={setRemoveText}
                  autoComplete="off"
                />
                <Text as="p" tone="subdued">
                  Shown once the product is already in the wishlist. When
                  clicked, the product will be removed from the wishlist.
                </Text>
              </BlockStack>

              <BlockStack gap="100">
                <Text as="p">Button style</Text>
                <ButtonGroup variant="segmented">
                  <Button
                    pressed={style === "filled"}
                    onClick={() => setStyle("filled")}
                  >
                    Filled
                  </Button>
                  <Button
                    pressed={style === "outline"}
                    onClick={() => setStyle("outline")}
                  >
                    Outline
                  </Button>
                </ButtonGroup>
              </BlockStack>

              <InlineStack gap="400" wrap>
                <BlockStack gap="100">
                  <Text as="p">Background</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      style={{
                        width: 36,
                        height: 36,
                        padding: 0,
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    />
                    <div style={{ width: 140 }}>
                      <TextField
                        label="Background hex"
                        labelHidden
                        value={bgColor}
                        onChange={setBgColor}
                        autoComplete="off"
                      />
                    </div>
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="p">Text</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      style={{
                        width: 36,
                        height: 36,
                        padding: 0,
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    />
                    <div style={{ width: 140 }}>
                      <TextField
                        label="Text hex"
                        labelHidden
                        value={textColor}
                        onChange={setTextColor}
                        autoComplete="off"
                      />
                    </div>
                  </InlineStack>
                </BlockStack>
              </InlineStack>

              <div style={{ maxWidth: 200 }}>
                <TextField
                  label="Corner radius"
                  type="number"
                  min={0}
                  max={40}
                  value={cornerRadius}
                  onChange={setCornerRadius}
                  autoComplete="off"
                />
              </div>

              <InlineStack gap="300" align="start">
                <Button onClick={handleSaveAtcButton} loading={isSaving}>
                  Save button settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <div
              style={{
                border: "1px solid #e1e1e1",
                borderRadius: 12,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              {/* Mock storefront header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 24px",
                  borderBottom: "1px solid #eee",
                }}
              >
                <div style={{ fontWeight: 700, letterSpacing: 1, color: "#999" }}>
                  [ Your store ]
                </div>
                <div style={{ display: "flex", gap: 20, color: "#333", fontSize: 14 }}>
                  <span>Home</span>
                  <span>Products</span>
                  <span>Collection</span>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", color: "#333" }}>
                  <span style={{ position: "relative" }}>
                    ♡
                    <span
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -8,
                        background: "#111",
                        color: "#fff",
                        borderRadius: 999,
                        fontSize: 10,
                        width: 14,
                        height: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      1
                    </span>
                  </span>
                  <span>🔍</span>
                  <span>🛒</span>
                </div>
              </div>

              {/* Mock product page */}
              <div
                style={{
                  display: "flex",
                  gap: 32,
                  padding: 32,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 320px", position: "relative" }}>
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      background: "#f1f1f1",
                      borderRadius: 6,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ♡
                  </span>
                </div>

                <div style={{ flex: "1 1 280px" }}>
                  <div style={{ fontSize: 22, color: "#333", marginBottom: 6 }}>
                    Product title
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <span style={{ textDecoration: "line-through", color: "#999", marginRight: 8 }}>
                      $300 USD
                    </span>
                    <span style={{ color: "#333" }}>$200 USD</span>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                      Color
                    </div>
                    <div
                      style={{
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        padding: "8px 12px",
                        fontSize: 14,
                        color: "#999",
                      }}
                    >
                      Select
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled
                    style={{
                      width: "100%",
                      padding: "13px 16px",
                      marginBottom: 8,
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      background: "#e8e8e8",
                      color: "#999",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    Add to cart
                  </button>

                  {atcEnabled && (
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        padding: "13px 16px",
                        marginBottom: 16,
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer",
                        borderRadius: `${parseInt(cornerRadius, 10) || 0}px`,
                        border: `1px solid ${bgColor}`,
                        background: style === "outline" ? "transparent" : bgColor,
                        color: style === "outline" ? bgColor : textColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      ♡ {addText || "Add to Wishlist"}
                    </button>
                  )}

                  <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                    Add a detailed description of your product, including its
                    key features, size and weight, and any important
                    information customers should know.
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      <li>Material: What is the product made of?</li>
                      <li>Dimensions: What is the size of the product?</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
