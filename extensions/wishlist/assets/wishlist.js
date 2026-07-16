(function () {
  "use strict";

  var HEART_OUTLINE =
    '<svg viewBox="0 0 24 24"><path d="M12 20.25c-.2 0-.39-.06-.55-.18C7.4 17.2 3 13.4 3 9.36 3 6.4 5.28 4 8.1 4c1.5 0 2.94.68 3.9 1.83A5.13 5.13 0 0 1 15.9 4C18.72 4 21 6.4 21 9.36c0 4.04-4.4 7.84-8.45 10.71-.16.12-.35.18-.55.18Z" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var configEl = document.getElementById("wishlist-app-config");
  if (!configEl) return;

  var CUSTOMER_ID_RAW = configEl.getAttribute("data-customer-id") || "";
  var WISHLIST_PAGE_URL =
    configEl.getAttribute("data-wishlist-page-url") || "/pages/wishlist";
  var PROXY_BASE = "/apps/wishlist";

  // Strings come from the store's active theme language (see
  // extensions/wishlist/locales/*.json), with English fallbacks in case an
  // older embed block config is cached without the data-i18n-* attributes.
  var I18N = {
    addToWishlist: configEl.getAttribute("data-i18n-add-to-wishlist") || "Add to wishlist",
    removeFromWishlist: configEl.getAttribute("data-i18n-remove-from-wishlist") || "Remove from wishlist",
    viewWishlist: configEl.getAttribute("data-i18n-view-wishlist") || "View wishlist",
    removeButton: configEl.getAttribute("data-i18n-remove-button") || "Remove from wishlist",
    addToCartButton: configEl.getAttribute("data-i18n-add-to-cart-button") || "Add to Cart",
    addedToCart: configEl.getAttribute("data-i18n-added-to-cart") || "Added!",
    toastAdded: configEl.getAttribute("data-i18n-toast-added") || "Product Added to Wishlist",
    empty: configEl.getAttribute("data-i18n-empty") || "Your wishlist is empty.",
    unavailable: configEl.getAttribute("data-i18n-unavailable") || "Wishlist is currently unavailable.",
    shareButton: configEl.getAttribute("data-i18n-share-button") || "Share Wishlist",
    linkCopied: configEl.getAttribute("data-i18n-link-copied") || "Link copied!",
    viewingShared: configEl.getAttribute("data-i18n-viewing-shared") || "You're viewing a shared wishlist.",
  };

  // A wishlist page URL like /pages/wishlist?share=customer_123 shows that
  // customer's wishlist read-only, so it can be shared for gifting.
  var SHARE_CUSTOMER_ID = new URLSearchParams(window.location.search).get(
    "share"
  );

  function getCustomerId() {
    if (CUSTOMER_ID_RAW) return "customer_" + CUSTOMER_ID_RAW;
    var key = "wishlist_guest_id";
    var id = localStorage.getItem(key);
    if (!id) {
      id = "guest_" + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(key, id);
    }
    return id;
  }

  var customerId = getCustomerId();
  var state = {
    enabled: true,
    items: [], // wishlist rows from the server for this customer
  };
  var pageItems = []; // items to render on the wishlist page (own or shared)

  // "Add to Wishlist" button shown below Add to Cart on the product page,
  // customizable from the app's Settings page. Filled in from /status.
  var ATC_BUTTON = {
    enabled: true,
    addText: "Add to Wishlist",
    removeText: "Remove from Wishlist",
    style: "filled",
    bgColor: "#222222",
    textColor: "#FFFFFF",
    cornerRadius: 0,
  };
  var atcButtonUpdaters = [];

  function productIdsSet() {
    var set = {};
    state.items.forEach(function (item) {
      set[item.productId] = true;
    });
    return set;
  }

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error("request_failed");
      return res.json();
    });
  }

  // If a logged-in customer still has a guest wishlist saved from before
  // they signed in, merge it into their account wishlist once.
  function mergeGuestWishlistIfNeeded() {
    if (!CUSTOMER_ID_RAW) return Promise.resolve();
    var guestId = localStorage.getItem("wishlist_guest_id");
    if (!guestId) return Promise.resolve();
    return fetchJSON(PROXY_BASE + "/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId: guestId, customerId: customerId }),
    })
      .then(function () {
        localStorage.removeItem("wishlist_guest_id");
      })
      .catch(function () {});
  }

  function loadStatusAndItems() {
    return fetchJSON(PROXY_BASE + "/status")
      .then(function (data) {
        state.enabled = !!data.enabled;
        if (!state.enabled) return { items: [] };
        state.enabled = !!data.enabled;
        if (data.wishlistPageUrl) WISHLIST_PAGE_URL = data.wishlistPageUrl;
        if (data.atcButton) Object.assign(ATC_BUTTON, data.atcButton);
        if (!state.enabled) return { items: [] };
        return mergeGuestWishlistIfNeeded().then(function () {
          return fetchJSON(
            PROXY_BASE + "/items?customerId=" + encodeURIComponent(customerId)
          );
        });
      })
      .then(function (data) {
        state.items = data.items || [];
      })
      .catch(function () {
        state.enabled = false;
      });
  }

  function getShopifyProductId(handle) {
    return fetch("/products/" + handle + ".js")
      .then(function (r) {
        return r.json();
      })
      .then(function (p) {
        return {
          productId: "gid://shopify/Product/" + p.id,
          variantId: p.variants && p.variants[0] ? "gid://shopify/ProductVariant/" + p.variants[0].id : null,
          productHandle: p.handle,
          productTitle: p.title,
          productImage: p.featured_image || (p.images && p.images[0]) || null,
          price: p.price ? (p.price / 100).toString() : null,
        };
      });
  }

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById("wishlist-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "wishlist-toast";
      toast.className = "wishlist-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 3000);
  }

  function toggleWishlist(handle, btn) {
    btn.classList.add("is-loading");
    getShopifyProductId(handle)
      .then(function (productData) {
        return fetchJSON(PROXY_BASE + "/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            Object.assign({ customerId: customerId }, productData)
          ),
        });
      })
      .then(function (data) {
        state.items = data.items || [];
        if (!SHARE_CUSTOMER_ID) pageItems = state.items;
        refreshAllHearts();
        updateHeaderCount();
        atcButtonUpdaters.forEach(function (update) {
          update();
        });
        if (data.added) showToast(I18N.toastAdded);
      })
      .catch(function () {
        /* silently ignore - button state stays unchanged */
      })
      .finally(function () {
        btn.classList.remove("is-loading");
      });
  }

  function extractHandleFromHref(href) {
    if (!href) return null;
    var path;
    try {
      path = new URL(href, window.location.origin).pathname;
    } catch (e) {
      return null;
    }
    // Only match a real product page link, not a share/social URL that
    // happens to carry a product URL inside a query string (e.g. Facebook's
    // sharer.php?u=.../products/...).
    var match = path.match(/^\/products\/([a-zA-Z0-9\-_%]+)/);
    return match ? match[1] : null;
  }

  function findCardAnchor(link) {
    // Walk up a few levels to find a reasonable "card" container to anchor
    // the heart button to (so it sits in the top-right of the image/card,
    // not the whole page).
    var el = link;
    for (var i = 0; i < 4 && el.parentElement; i++) {
      el = el.parentElement;
      if (
        el.matches(
          '[class*="card"], [class*="grid-item"], [class*="product-item"], li'
        )
      ) {
        return el;
      }
    }
    return link.parentElement || link;
  }

  function injectHearts() {
    if (!state.enabled) return;
    var links = document.querySelectorAll('a[href*="/products/"]');
    var seenHandles = {};

    links.forEach(function (link) {
      var handle = extractHandleFromHref(link.getAttribute("href") || "");
      if (!handle) return;

      var anchorEl = findCardAnchor(link);
      if (!anchorEl || anchorEl.querySelector(".wishlist-heart-btn")) {
        // Already has a heart, or dedupe multiple links to the same card
        return;
      }
      if (seenHandles[handle + "-" + (anchorEl.dataset.wishlistTag || "")]) return;

      anchorEl.classList.add("wishlist-card-anchor");

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wishlist-heart-btn";
      btn.setAttribute("aria-label", I18N.addToWishlist);
      btn.innerHTML = HEART_OUTLINE;
      btn.dataset.handle = handle;

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleWishlist(handle, btn);
      });

      anchorEl.appendChild(btn);
      seenHandles[handle] = true;
    });

    refreshAllHearts();
  }

  function refreshAllHearts() {
    var idsByHandle = {};
    state.items.forEach(function (item) {
      idsByHandle[item.productHandle] = true;
    });
    document.querySelectorAll(".wishlist-heart-btn").forEach(function (btn) {
      var active = !!idsByHandle[btn.dataset.handle];
      btn.classList.toggle("is-active", active);
      btn.setAttribute(
        "aria-label",
        active ? I18N.removeFromWishlist : I18N.addToWishlist
      );
    });
  }

  // ---------- Header icon (next to the cart) ----------
  var headerIconEl = null;

  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      (rect.width > 0 || rect.height > 0) &&
      el.offsetParent !== null
    );
  }

  function findVisibleCartLink() {
    var candidates = document.querySelectorAll(
      'a[href*="/cart"], #cart-icon-bubble, a[href$="/cart"], button[aria-label*="cart" i], a[aria-label*="cart" i]'
    );
    for (var i = 0; i < candidates.length; i++) {
      if (isVisible(candidates[i])) return candidates[i];
    }
    return null;
  }

  function injectHeaderIcon() {
    if (!state.enabled || headerIconEl) return;

    var cartLink = findVisibleCartLink();

    var wrapper = document.createElement("a");
    wrapper.href = WISHLIST_PAGE_URL;
    wrapper.className = "wishlist-header-icon";
    wrapper.setAttribute("aria-label", I18N.viewWishlist);
    wrapper.innerHTML =
      HEART_OUTLINE + '<span class="wishlist-header-icon__count" hidden>0</span>';

    if (cartLink && cartLink.parentElement) {
      cartLink.parentElement.insertBefore(wrapper, cartLink);
    } else {
      wrapper.classList.add("wishlist-header-icon--floating");
      document.body.appendChild(wrapper);
    }

    headerIconEl = wrapper;
    updateHeaderCount();
  }

  function updateHeaderCount() {
    if (!headerIconEl) return;
    var countEl = headerIconEl.querySelector(".wishlist-header-icon__count");
    var count = state.items.length;
    countEl.textContent = count;
    countEl.hidden = count === 0;
  }

  // ---------- "Add to Wishlist" button below Add to Cart ----------
  function getCurrentProductHandle() {
    var match = window.location.pathname.match(/\/products\/([a-zA-Z0-9\-_%]+)/);
    return match ? match[1] : null;
  }

  function findAddToCartButton() {
    var selectors = [
      'form[action*="/cart/add"] button[type="submit"]',
      'form[action*="/cart/add"] button[name="add"]',
      'button[name="add"]',
      '.product-form__submit',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function injectAddToCartWishlistButton() {
    if (!state.enabled || !ATC_BUTTON.enabled) return;
    if (document.getElementById("wishlist-atc-btn")) return;

    var handle = getCurrentProductHandle();
    if (!handle) return;

    var addToCartBtn = findAddToCartButton();
    if (!addToCartBtn) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "wishlist-atc-btn";
    btn.className =
      "wishlist-atc-btn wishlist-atc-btn--" +
      (ATC_BUTTON.style === "outline" ? "outline" : "filled");
    btn.style.setProperty("--wishlist-atc-bg", ATC_BUTTON.bgColor);
    btn.style.setProperty("--wishlist-atc-color", ATC_BUTTON.textColor);
    btn.style.setProperty(
      "--wishlist-atc-radius",
      (ATC_BUTTON.cornerRadius || 0) + "px"
    );
    btn.innerHTML = HEART_OUTLINE + '<span class="wishlist-atc-btn__label"></span>';

    function updateLabel() {
      var idsByHandle = {};
      state.items.forEach(function (item) {
        idsByHandle[item.productHandle] = true;
      });
      var active = !!idsByHandle[handle];
      btn.classList.toggle("is-active", active);
      btn.querySelector(".wishlist-atc-btn__label").textContent = active
        ? ATC_BUTTON.removeText
        : ATC_BUTTON.addText;
    }
    updateLabel();
    atcButtonUpdaters.push(updateLabel);

    btn.addEventListener("click", function () {
      toggleWishlist(handle, btn);
    });

    addToCartBtn.insertAdjacentElement("afterend", btn);
  }

  // ---------- Wishlist page grid ----------

  // Lets the owner copy a link to their own wishlist page (?share=<id>) so
  // it can be viewed read-only by anyone with the link, e.g. for gifting.
  function injectShareButton(grid) {
    if (SHARE_CUSTOMER_ID) return;
    if (document.getElementById("wishlist-share-btn")) return;

    var btn = document.createElement("button");
    btn.id = "wishlist-share-btn";
    btn.type = "button";
    btn.className = "wishlist-share-btn";
    btn.textContent = I18N.shareButton;
    btn.addEventListener("click", function () {
      var shareUrl =
        window.location.origin +
        WISHLIST_PAGE_URL +
        "?share=" +
        encodeURIComponent(customerId);
      var done = function () {
        showToast(I18N.linkCopied);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(done, done);
      } else {
        done();
      }
    });
    grid.parentNode.insertBefore(btn, grid);
  }

  function renderWishlistPage() {
    var grid = document.getElementById("wishlist-page-grid");
    if (!grid) return;

    injectShareButton(grid);

    if (SHARE_CUSTOMER_ID && !document.getElementById("wishlist-shared-banner")) {
      var banner = document.createElement("p");
      banner.id = "wishlist-shared-banner";
      banner.className = "wishlist-shared-banner";
      banner.textContent = I18N.viewingShared;
      grid.parentNode.insertBefore(banner, grid);
    }

    if (!state.enabled) {
      grid.innerHTML = '<p class="wishlist-grid__empty"></p>';
      grid.querySelector(".wishlist-grid__empty").textContent = I18N.unavailable;
      return;
    }

    if (pageItems.length === 0) {
      var emptyText = grid.dataset.emptyText || I18N.empty;
      grid.innerHTML = '<p class="wishlist-grid__empty"></p>';
      grid.querySelector(".wishlist-grid__empty").textContent = emptyText;
      return;
    }

    grid.innerHTML = "";
    pageItems.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "wishlist-card";

      var img = document.createElement("img");
      img.className = "wishlist-card__image";
      img.src = item.productImage || "";
      img.alt = item.productTitle;

      var body = document.createElement("div");
      body.className = "wishlist-card__body";

      var titleLink = document.createElement("a");
      titleLink.className = "wishlist-card__title";
      titleLink.href = "/products/" + item.productHandle;
      titleLink.textContent = item.productTitle;

      var price = document.createElement("div");
      price.className = "wishlist-card__price";
      if (item.price) price.textContent = "$" + item.price;

      var removeBtn = null;
      if (!SHARE_CUSTOMER_ID) {
        removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "wishlist-card__remove-btn";
        removeBtn.textContent = I18N.removeButton;
        removeBtn.addEventListener("click", function () {
          removeBtn.disabled = true;
          fetchJSON(PROXY_BASE + "/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerId: customerId,
              productId: item.productId,
              variantId: item.variantId,
            }),
          })
            .then(function (data) {
              state.items = data.items || [];
              pageItems = state.items;
              renderWishlistPage();
              refreshAllHearts();
              updateHeaderCount();
            })
            .catch(function () {
              removeBtn.disabled = false;
            });
        });
      }

      var addToCartBtn = document.createElement("button");
      addToCartBtn.type = "button";
      addToCartBtn.className = "wishlist-card__add-to-cart-btn";
      addToCartBtn.textContent = I18N.addToCartButton;
      if (!item.variantId) {
        addToCartBtn.disabled = true;
      } else {
        addToCartBtn.addEventListener("click", function () {
          addToCartBtn.disabled = true;
          var variantNumericId = item.variantId.split("/").pop();
          fetch("/cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{ id: variantNumericId, quantity: 1 }],
            }),
          })
            .then(function (r) {
              if (!r.ok) throw new Error("add_to_cart_failed");
              addToCartBtn.textContent = I18N.addedToCart;
              setTimeout(function () {
                addToCartBtn.textContent = I18N.addToCartButton;
                addToCartBtn.disabled = false;
              }, 1500);
            })
            .catch(function () {
              addToCartBtn.disabled = false;
            });
        });
      }

      body.appendChild(titleLink);
      if (item.price) body.appendChild(price);
      if (removeBtn) body.appendChild(removeBtn);
      body.appendChild(addToCartBtn);
      card.appendChild(img);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function loadPageItems() {
    if (SHARE_CUSTOMER_ID) {
      return fetchJSON(
        PROXY_BASE + "/items?customerId=" + encodeURIComponent(SHARE_CUSTOMER_ID)
      )
        .then(function (data) {
          pageItems = data.items || [];
        })
        .catch(function () {
          pageItems = [];
        });
    }
    pageItems = state.items;
    return Promise.resolve();
  }

  function normalizePath(path) {
    if (!path) return "";
    var withoutQuery = path.split("?")[0].split("#")[0];
    return withoutQuery.replace(/\/+$/, "").toLowerCase();
  }

  // If we're on the configured wishlist page and no "Wishlist Page" app
  // block was manually added to the template, build the grid markup
  // ourselves - so merchants never have to touch the theme editor.
  function injectWishlistPageIfNeeded() {
    if (document.getElementById("wishlist-page-grid")) return;
    if (normalizePath(window.location.pathname) !== normalizePath(WISHLIST_PAGE_URL)) {
      return;
    }

    var container = document.createElement("div");
    container.id = "wishlist-page-root";
    container.className = "wishlist-page";
    container.innerHTML = '<div id="wishlist-page-grid" class="wishlist-grid"></div>';

    // The page body we create via the Admin API contains this placeholder,
    // which the theme renders right after the page title - use it so the
    // grid lands below the title instead of above it.
    var placeholder = document.getElementById("wishlist-page-placeholder");
    if (placeholder) {
      placeholder.replaceWith(container);
      return;
    }

    var main =
      document.querySelector("main#MainContent") ||
      document.querySelector("main") ||
      document.body;
    main.appendChild(container);
  }

  function init() {
    loadStatusAndItems().then(function () {
      if (!state.enabled) return;
      injectHearts();
      injectHeaderIcon();
      injectAddToCartWishlistButton();
      injectWishlistPageIfNeeded();
      loadPageItems().then(renderWishlistPage);

      // Re-scan when the theme injects new product markup dynamically
      // (infinite scroll, quick-view modals, filter/sort re-renders).
      var observer = new MutationObserver(function () {
        clearTimeout(window.__wishlistDebounce);
        window.__wishlistDebounce = setTimeout(function () {
          injectHearts();
          injectHeaderIcon();
          injectAddToCartWishlistButton();
        }, 300);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
