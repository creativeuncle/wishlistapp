-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "productHandle" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT,
    "price" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "wishlistPageUrl" TEXT,
    "klaviyoApiKey" TEXT,
    "atcButtonEnabled" BOOLEAN NOT NULL DEFAULT true,
    "atcButtonAddText" TEXT NOT NULL DEFAULT 'Add to Wishlist',
    "atcButtonRemoveText" TEXT NOT NULL DEFAULT 'Remove from Wishlist',
    "atcButtonStyle" TEXT NOT NULL DEFAULT 'filled',
    "atcButtonBgColor" TEXT NOT NULL DEFAULT '#222222',
    "atcButtonTextColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "atcButtonCornerRadius" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistItem_shop_idx" ON "WishlistItem"("shop");

-- CreateIndex
CREATE INDEX "WishlistItem_shop_customerId_idx" ON "WishlistItem"("shop", "customerId");

-- CreateIndex
CREATE INDEX "WishlistItem_shop_productId_idx" ON "WishlistItem"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_shop_customerId_productId_variantId_key" ON "WishlistItem"("shop", "customerId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
