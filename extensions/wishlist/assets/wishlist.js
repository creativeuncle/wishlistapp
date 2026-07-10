(function () {
  "use strict";

  var HEART_OUTLINE =
    '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.1 2.2 4.5 5.6 4c2-.3 3.9.6 5 2.2 1.1-1.6 3-2.5 5-2.2 3.4.5 5.2 4.1 3.6 7.7C19.5 16.4 12 21 12 21z"/></svg>';

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
  };

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

  function loadStatusAndItems() {
    return fetchJSON(PROXY_BASE + "/status")
      .then(function (data) {
        state.enabled = !!data.enabled;
        if (!state.enabled) return { items: [] };
        state.enabled = !!data.enabled;
        if (data.wishlistPageUrl) WISHLIST_PAGE_URL = data.wishlistPageUrl;
        if (!state.enabled) return { items: [] };
        return fetchJSON(
          PROXY_BASE + "/items?customerId=" + encodeURIComponent(customerId)
        );
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
        refreshAllHearts();
        updateHeaderCount();
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
    var match = href.match(/\/products\/([a-zA-Z0-9\-_%]+)/);
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

  // ---------- Wishlist page grid ----------
  function renderWishlistPage() {
    var grid = document.getElementById("wishlist-page-grid");
    if (!grid) return;

    if (!state.enabled) {
      grid.innerHTML = '<p class="wishlist-grid__empty"></p>';
      grid.querySelector(".wishlist-grid__empty").textContent = I18N.unavailable;
      return;
    }

    if (state.items.length === 0) {
      var emptyText = grid.dataset.emptyText || I18N.empty;
      grid.innerHTML = '<p class="wishlist-grid__empty"></p>';
      grid.querySelector(".wishlist-grid__empty").textContent = emptyText;
      return;
    }

    grid.innerHTML = "";
    state.items.forEach(function (item) {
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

      var removeBtn = document.createElement("button");
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
            renderWishlistPage();
            refreshAllHearts();
            updateHeaderCount();
          })
          .catch(function () {
            removeBtn.disabled = false;
          });
      });

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
      body.appendChild(removeBtn);
      body.appendChild(addToCartBtn);
      card.appendChild(img);
      card.appendChild(body);
      grid.appendChild(card);
    });
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
      injectWishlistPageIfNeeded();
      renderWishlistPage();

      // Re-scan when the theme injects new product markup dynamically
      // (infinite scroll, quick-view modals, filter/sort re-renders).
      var observer = new MutationObserver(function () {
        clearTimeout(window.__wishlistDebounce);
        window.__wishlistDebounce = setTimeout(function () {
          injectHearts();
          injectHeaderIcon();
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
