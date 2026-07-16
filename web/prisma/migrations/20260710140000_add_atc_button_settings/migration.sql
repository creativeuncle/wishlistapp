-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "atcButtonEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN "atcButtonAddText" TEXT NOT NULL DEFAULT 'Add to Wishlist';
ALTER TABLE "ShopSettings" ADD COLUMN "atcButtonRemoveText" TEXT NOT NULL DEFAULT 'Added to Wishlist';
ALTER TABLE "ShopSettings" ADD COLUMN "atcButtonStyle" TEXT NOT NULL DEFAULT 'filled';
ALTER TABLE "ShopSettings" ADD COLUMN "atcButtonBgColor" TEXT NOT NULL DEFAULT '#222222';
ALTER TABLE "ShopSettings" ADD COLUMN "atcButtonTextColor" TEXT NOT NULL DEFAULT '#FFFFFF';
ALTER TABLE "ShopSettings" ADD COLUMN "atcButtonCornerRadius" INTEGER NOT NULL DEFAULT 0;
