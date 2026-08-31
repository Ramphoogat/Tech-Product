/* ==========================================================================
   Product page: media gallery, variant selection, add to cart.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Media gallery
     ------------------------------------------------------------------------ */

  class MediaGallery extends HTMLElement {
    constructor() {
      super();
      this.stage = this.querySelector('.media-gallery__stage');
      this.thumbs = Array.from(this.querySelectorAll('.media-gallery__thumb'));

      this.addEventListener('click', this.handleClick.bind(this));
      this.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    handleClick(event) {
      const thumb = event.target.closest('.media-gallery__thumb');
      if (!thumb) return;
      this.showMedia(thumb.dataset.mediaId, true);
    }

    handleKeyDown(event) {
      const thumb = event.target.closest('.media-gallery__thumb');
      if (!thumb) return;

      const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
      const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
      if (!forward && !back) return;

      event.preventDefault();
      const index = this.thumbs.indexOf(thumb);
      const next = forward
        ? this.thumbs[(index + 1) % this.thumbs.length]
        : this.thumbs[(index - 1 + this.thumbs.length) % this.thumbs.length];

      this.showMedia(next.dataset.mediaId, true);
    }

    showMedia(mediaId, moveFocus) {
      if (!mediaId) return;

      const target = this.querySelector(`.media-gallery__item[data-media-id="${mediaId}"]`);
      if (!target) return;

      this.querySelectorAll('.media-gallery__item').forEach(function (item) {
        item.hidden = item !== target;

        const video = item.querySelector('video');
        if (video && item.hidden) video.pause();
      });

      this.thumbs.forEach(function (thumb) {
        const active = thumb.dataset.mediaId === String(mediaId);
        thumb.setAttribute('aria-current', active ? 'true' : 'false');
        thumb.tabIndex = active ? 0 : -1;
        if (active && moveFocus) thumb.focus();
      });
    }
  }

  customElements.define('media-gallery', MediaGallery);

  /* ------------------------------------------------------------------------
     Variant selection

     The new price, stock state and buy button are rendered by Shopify through
     the Section Rendering API rather than formatted here, so money always
     matches the shopper's market.
     ------------------------------------------------------------------------ */

  class VariantSelects extends HTMLElement {
    constructor() {
      super();
      this.sectionId = this.dataset.section;
      this.productUrl = this.dataset.url;

      const data = this.querySelector('script[data-variant-data]');
      this.variants = data ? JSON.parse(data.textContent) : [];

      this.addEventListener('change', this.handleChange.bind(this));
    }

    get selectedOptions() {
      return Array.from(this.querySelectorAll('input[type="radio"]:checked'))
        .sort((a, b) => Number(a.dataset.optionPosition) - Number(b.dataset.optionPosition))
        .map((input) => input.value);
    }

    handleChange() {
      this.updateLegends();

      const selected = this.selectedOptions;
      const variant = this.variants.find((candidate) =>
        candidate.options.every((option, index) => option === selected[index])
      );

      if (!variant) {
        this.setUnavailable();
        return;
      }

      this.updateUrl(variant);
      this.renderSection(variant);
    }

    updateLegends() {
      this.querySelectorAll('input[type="radio"]:checked').forEach((input) => {
        const label = this.querySelector(`[data-selected-value="${input.dataset.optionPosition}"]`);
        if (label) label.textContent = input.value;
      });
    }

    updateUrl(variant) {
      const url = new URL(this.productUrl, window.location.origin);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url.toString());
    }

    setUnavailable() {
      const button = document.querySelector(`#BuyButtons-${this.sectionId} .product-form__submit`);
      if (!button) return;

      button.disabled = true;
      const label = button.querySelector('.button__label');
      if (label) label.textContent = window.themeStrings.unavailable;
    }

    async renderSection(variant) {
      const url = `${this.productUrl}?variant=${variant.id}&section_id=${this.sectionId}`;

      try {
        const doc = await window.theme.fetchSection(url);

        [
          `#price-${this.sectionId}`,
          `#Sku-${this.sectionId}`,
          `#Inventory-${this.sectionId}`,
          `#BuyButtons-${this.sectionId}`,
        ].forEach(function (selector) {
          const source = doc.querySelector(selector);
          const destination = document.querySelector(selector);
          if (source && destination) destination.innerHTML = source.innerHTML;
        });

        const info = doc.querySelector(`#ProductInfo-${this.sectionId}`);
        const gallery = document.querySelector(`media-gallery[data-section="${this.sectionId}"]`);
        if (info && gallery && info.dataset.featuredMediaId) {
          gallery.showMedia(info.dataset.featuredMediaId, false);
        }
      } catch (error) {
        window.theme.announce(window.themeStrings.error);
      }
    }
  }

  customElements.define('variant-selects', VariantSelects);

  /* ------------------------------------------------------------------------
     Add to cart
     ------------------------------------------------------------------------ */

  class ProductForm extends HTMLElement {
    constructor() {
      super();
      this.form = this.querySelector('form');
      this.errorElement = this.querySelector('.product-form__error');
      if (this.form) this.form.addEventListener('submit', this.handleSubmit.bind(this));
    }

    get submitButton() {
      return this.querySelector('.product-form__submit');
    }

    async handleSubmit(event) {
      event.preventDefault();
      if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

      this.setLoading(true);
      this.setError('');

      const formData = new FormData(this.form);
      const sections =
        (window.theme.cartSectionIds && window.theme.cartSectionIds()) || ['cart-icon-bubble'];

      formData.append('sections', sections.join(','));
      formData.append('sections_url', window.location.pathname);

      try {
        const response = await fetch(window.routes.cart_add_url, {
          method: 'POST',
          headers: { Accept: 'application/javascript' },
          body: formData,
        });
        const result = await response.json();

        if (result.status) {
          this.setError(result.description || result.message);
          return;
        }

        document.dispatchEvent(
          new CustomEvent('cart:updated', { detail: { sections: result.sections, open: true } })
        );
      } catch (error) {
        this.setError(window.themeStrings.error);
      } finally {
        this.setLoading(false);
      }
    }

    setLoading(loading) {
      const button = this.submitButton;
      if (!button) return;

      button.setAttribute('aria-disabled', loading ? 'true' : 'false');
      const spinner = button.querySelector('.button__spinner');
      if (spinner) spinner.hidden = !loading;
    }

    setError(message) {
      if (!this.errorElement) return;
      this.errorElement.textContent = message || '';
      this.errorElement.hidden = !message;
      if (message) window.theme.announce(message);
    }
  }

  customElements.define('product-form', ProductForm);
})();
