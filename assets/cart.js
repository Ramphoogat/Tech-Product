/* ==========================================================================
   Cart: line updates and the cart drawer.
   Every mutation goes through the Cart AJAX API asking for the affected
   sections back, so the drawer, the cart page and the header count are
   re-rendered by Shopify instead of being patched by hand.
   ========================================================================== */

(function () {
  'use strict';

  if (window.__themeCartLoaded) return;
  window.__themeCartLoaded = true;

  const theme = window.theme;

  theme.cartSectionIds = function () {
    const ids = [];
    if (document.getElementById('shopify-section-cart-drawer')) ids.push('cart-drawer');
    if (document.getElementById('shopify-section-main-cart-items')) ids.push('main-cart-items');
    if (document.getElementById('shopify-section-main-cart-footer')) ids.push('main-cart-footer');
    ids.push('cart-icon-bubble');
    return ids;
  };

  function replaceSection(id, html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const source = doc.querySelector(`#shopify-section-${id}`);
    if (!source) return;

    /* The cart icon lives inside the header, not in a section wrapper. */
    const destination =
      id === 'cart-icon-bubble'
        ? document.getElementById('CartIconBubble')
        : document.getElementById(`shopify-section-${id}`);

    if (destination) destination.innerHTML = source.innerHTML;
  }

  function renderSections(sections) {
    if (!sections) return;
    Object.keys(sections).forEach(function (id) {
      replaceSection(id, sections[id]);
    });
  }

  /* ------------------------------------------------------------------------
     Cart drawer
     ------------------------------------------------------------------------ */

  class CartDrawer extends HTMLElement {
    constructor() {
      super();
      this.onKeyDown = this.handleKeyDown.bind(this);

      this.addEventListener('click', (event) => {
        if (event.target.closest('[data-cart-drawer-close]')) this.close();
      });
    }

    get panel() {
      return this.querySelector('.cart-drawer__panel');
    }

    open(opener) {
      this.opener = opener || document.activeElement;
      this.classList.add('is-open');
      theme.lockScroll(true);
      document.addEventListener('keydown', this.onKeyDown);

      const closeButton = this.querySelector('.cart-drawer__close');
      theme.trapFocus(this.panel, closeButton || this.panel);
    }

    close() {
      this.classList.remove('is-open');
      theme.lockScroll(false);
      document.removeEventListener('keydown', this.onKeyDown);
      theme.removeTrapFocus(this.opener);
      this.opener = null;
    }

    handleKeyDown(event) {
      if (event.key === 'Escape') this.close();
    }
  }

  customElements.define('cart-drawer', CartDrawer);

  /* ------------------------------------------------------------------------
     Cart lines
     ------------------------------------------------------------------------ */

  class CartItems extends HTMLElement {
    constructor() {
      super();
      this.addEventListener('change', theme.debounce(this.handleChange.bind(this), 300));
      this.addEventListener('click', this.handleClick.bind(this));
    }

    handleClick(event) {
      const remove = event.target.closest('.cart-item__remove');
      if (!remove) return;

      event.preventDefault();
      this.updateQuantity(remove.dataset.line, 0);
    }

    handleChange(event) {
      const input = event.target.closest('.quantity__input');
      if (!input) return;

      const row = input.closest('[data-line]');
      if (!row) return;

      this.updateQuantity(row.dataset.line, input.value);
    }

    setLoading(loading) {
      const list = this.querySelector('.cart-items, .cart-table');
      if (list) list.classList.toggle('is-loading', loading);
    }

    showLineError(line, message) {
      const row = this.querySelector(`[data-line="${line}"]`);
      const target = row && row.querySelector('[data-line-error]');
      if (!target) return;

      target.textContent = message;
      target.hidden = !message;
      theme.announce(message);
    }

    async updateQuantity(line, quantity) {
      this.setLoading(true);
      this.showLineError(line, '');

      try {
        const response = await fetch(window.routes.cart_change_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            line: Number(line),
            quantity: Number(quantity),
            sections: theme.cartSectionIds(),
            sections_url: window.location.pathname,
          }),
        });

        const state = await response.json();

        if (!response.ok || state.errors) {
          this.showLineError(line, state.errors || state.description || window.themeStrings.error);
          return;
        }

        const updated = state.items && state.items[Number(line) - 1];
        if (updated && Number(quantity) > 0 && updated.quantity !== Number(quantity)) {
          this.showLineError(
            line,
            window.themeStrings.cartQuantityError.replace('@@Q@@', updated.quantity)
          );
        }

        document.dispatchEvent(
          new CustomEvent('cart:updated', {
            detail: { sections: state.sections, open: false, focusLine: line },
          })
        );
      } catch (error) {
        this.showLineError(line, window.themeStrings.error);
      } finally {
        this.setLoading(false);
      }
    }
  }

  customElements.define('cart-items', CartItems);

  /* ------------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------------ */

  document.addEventListener('cart:updated', function (event) {
    const drawer = document.querySelector('cart-drawer');
    const wasOpen = drawer && drawer.classList.contains('is-open');
    const opener = drawer && drawer.opener;

    renderSections(event.detail.sections);

    const nextDrawer = document.querySelector('cart-drawer');
    if (nextDrawer && (wasOpen || event.detail.open)) {
      nextDrawer.open(opener);
      if (event.detail.open) theme.announce(document.title);
    }

    if (event.detail.focusLine) {
      const input = document.querySelector(
        `[data-line="${event.detail.focusLine}"] .quantity__input`
      );
      if (input) input.focus();
    }
  });

  /* Header cart button opens the drawer instead of navigating. */
  document.addEventListener('click', function (event) {
    const toggle = event.target.closest('[data-cart-drawer-toggle]');
    if (!toggle) return;

    const drawer = document.querySelector('cart-drawer');
    if (!drawer) return;

    event.preventDefault();
    drawer.open(toggle);
  });
})();
