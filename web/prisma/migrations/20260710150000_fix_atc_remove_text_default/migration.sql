-- Update the default "remove" button label to something clearer, but only
-- for shops that never customized it away from the old default.
UPDATE "ShopSettings"
SET "atcButtonRemoveText" = 'Remove from Wishlist'
WHERE "atcButtonRemoveText" = 'Added to Wishlist';
