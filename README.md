# Wishlist — Shopify App (Step 1)

Ye Step 1 hai jisme wo saare features bana diye hain jo tumne bataye the. Neeche
poora structure aur setup steps hain.

## Ab tak kya ban chuka hai

### Customer-facing (theme par)
- Har product card / product page ke top-right corner par **heart icon**
  automatically inject hota hai (`extensions/wishlist/assets/wishlist.js`).
  Click karne par add, dubara click karne par remove — server par turant
  save hota hai.
- Header me cart icon ke paas ek **wishlist icon** (with count badge) inject
  hota hai. Agar tumhari theme ka cart icon detect nahi hua to ek floating
  icon top-right corner me fallback ke taur par dikhta hai.
- Ek **Wishlist page app block** (`wishlist-page.liquid`) hai jise kisi bhi
  page par add kar sakte ho — wahan grid me saare saved products aur ek
  "Remove from wishlist" button dikhega.

### Store owner (Admin dashboard)
- App install hote hi seedha embedded admin khulta hai, do tabs ke saath:
  **Dashboard** aur **Settings**.
- **Dashboard**: total unique users jo wishlist use kar rahe hain, total
  distinct products jo kisi na kisi wishlist me hain, aur total wishlist adds.
- **Settings**: ek simple **Enable/Disable** toggle — disable karne par
  storefront ka heart icon aur wishlist page dono hide/disabled ho jaate hain.

## Folder structure

```
wishlist-app/
├── app/                      # Remix admin app (embedded in Shopify admin)
│   ├── routes/
│   │   ├── app.jsx           # Layout + Dashboard/Settings nav
│   │   ├── app._index.jsx    # Dashboard tab
│   │   ├── app.settings.jsx  # Settings tab (Enable/Disable toggle)
│   │   ├── proxy.$.jsx       # App proxy API used by the storefront JS
│   │   ├── auth.$.jsx
│   │   └── webhooks.app.uninstalled.jsx
│   ├── shopify.server.js
│   └── db.server.js
├── extensions/wishlist/       # Theme App Extension
│   ├── blocks/
│   │   ├── wishlist-embed.liquid   # App embed: injects hearts + header icon
│   │   └── wishlist-page.liquid    # App block: wishlist grid page
│   └── assets/
│       ├── wishlist.js
│       └── wishlist.css
├── prisma/schema.prisma       # WishlistItem, ShopSettings, Session models
└── shopify.app.toml
```

## Setup (local machine par)

1. **Shopify Partner account + dev store** ready rakho.
2. Dependencies install karo:
   ```bash
   npm install
   ```
3. `shopify.app.toml` me apna `client_id` aur `application_url` daalo (ya
   `shopify app config link` chala kar naya app link/create karo).
4. Database migrate karo:
   ```bash
   npx prisma migrate dev --name init
   ```
5. App run karo:
   ```bash
   shopify app dev
   ```
   Ye tumhe app install karne ka link dega — apne dev store par install
   karte hi seedha Dashboard khul jayega.
6. Store ke **Theme editor** me sirf ek cheez karni hai: **App embeds**
   section me "Wishlist" ko ON karo (hearts + header icon ke liye) — ye
   ek-baar ka global toggle hai, kisi specific page pe kuch add nahi karna.
   Wishlist page (`/pages/wishlist`) app install hote hi Admin API se khud
   ban jaata hai (ya Dashboard ke "Create Wishlist Page" button se), aur
   uska product grid bhi storefront JS khud inject kar deta hai — kisi bhi
   page/template me manually app block add karne ki zaroorat nahi.

## Important note (limitation)

Har Shopify theme ka HTML structure alag hota hai, isliye heart icon aur
header icon **automatic detection** se inject hote hain (common patterns
match karke). Zyadatar themes (Dawn aur uske jaise) me ye seedha kaam karega,
lekin agar tumhari theme heavily customized hai to placement thoda adjust
karna pad sakta hai — wo hum next step me tumhari actual theme dekh kar
fine-tune kar sakte hain.

## Next steps (jab bologe extend karenge)

- Guest wishlist ko customer login hone par merge karna
- Wishlist se "Add to cart" seedha button
- Email reminder jab wishlist product par discount aaye
- CSV export of wishlist data for merchant
- Multi-language support in the extension blocks
