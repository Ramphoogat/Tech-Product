/* ==========================================================================
   Shared behaviour and base web components.
   Loaded first; everything else assumes window.theme exists.
   ========================================================================== */

(function () {
  'use strict';

  const FOCUSABLE_SELECTOR = [
    'summary',
    'a[href]',
    'button:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex^="-"])',
  ].join(', ');

  let trapHandler = null;

  const theme = {
    focusableSelector: FOCUSABLE_SELECTOR,

    getFocusable(container) {
      return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    },

    trapFocus(container, elementToFocus) {
      theme.removeTrapFocus();

      trapHandler = function (event) {
        if (event.key !== 'Tab') return;

        const focusable = theme.getFocusable(container);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener('keydown', trapHandler);
      (elementToFocus || container).focus();
    },

    removeTrapFocus(elementToFocus) {
      if (trapHandler) {
        document.removeEventListener('keydown', trapHandler);
        trapHandler = null;
      }
      if (elementToFocus) elementToFocus.focus();
    },

    lockScroll(locked) {
      document.body.style.overflow = locked ? 'hidden' : '';
    },

    announce(message) {
      const region = document.getElementById('LiveRegion');
      if (!region || !message) return;
      region.textContent = '';
      window.setTimeout(function () {
        region.textContent = message;
      }, 50);
    },

    debounce(fn, wait) {
      let timer;
      return function () {
        const args = arguments;
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    /* Section Rendering API: returns a DOM document for the requested sections. */
    async fetchSection(url) {
      const response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!response.ok) throw new Error(response.statusText);
      const text = await response.text();
      return new DOMParser().parseFromString(text, 'text/html');
    },
  };

  window.theme = theme;

  /* ------------------------------------------------------------------------
     Disclosure: a <details> that closes on Escape or an outside click.
     ------------------------------------------------------------------------ */

  class DetailsDisclosure extends HTMLElement {
    constructor() {
      super();
      this.details = this.querySelector('details');
      this.summary = this.querySelector('summary');
      if (!this.details) return;

      this.onDocumentClick = this.handleDocumentClick.bind(this);
      this.onKeyDown = this.handleKeyDown.bind(this);
      this.details.addEventListener('toggle', this.handleToggle.bind(this));
    }

    handleToggle() {
      if (this.details.open) {
        document.addEventListener('click', this.onDocumentClick);
        document.addEventListener('keydown', this.onKeyDown);
        this.onOpen();
      } else {
        document.removeEventListener('click', this.onDocumentClick);
        document.removeEventListener('keydown', this.onKeyDown);
        this.onClose();
      }
    }

    handleDocumentClick(event) {
      if (!this.contains(event.target)) this.close();
    }

    handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.close(true);
      }
    }

    close(returnFocus) {
      if (!this.details.open) return;
      this.details.open = false;
      if (returnFocus && this.summary) this.summary.focus();
    }

    onOpen() {}
    onClose() {}
  }

  customElements.define('details-disclosure', DetailsDisclosure);

  /* ------------------------------------------------------------------------
     Search modal: same disclosure behaviour, plus focus into the input.
     ------------------------------------------------------------------------ */

  class DetailsModal extends DetailsDisclosure {
    onOpen() {
      const input = this.querySelector('input[type="search"]');
      if (input) window.requestAnimationFrame(() => input.focus());
    }
  }

  customElements.define('details-modal', DetailsModal);

  /* ------------------------------------------------------------------------
     Mobile navigation drawer.
     ------------------------------------------------------------------------ */

  class MenuDrawer extends DetailsDisclosure {
    onOpen() {
      const drawer = this.querySelector('.menu-drawer');
      theme.lockScroll(true);
      if (drawer) theme.trapFocus(drawer, drawer);
    }

    onClose() {
      theme.lockScroll(false);
      theme.removeTrapFocus();
    }
  }

  customElements.define('menu-drawer', MenuDrawer);

  /* ------------------------------------------------------------------------
     Sticky header: publish its height so sticky columns can offset from it.
     ------------------------------------------------------------------------ */

  class StickyHeader extends HTMLElement {
    connectedCallback() {
      this.setHeight();
      this.observer = new ResizeObserver(() => this.setHeight());
      this.observer.observe(this);
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
    }

    setHeight() {
      document.documentElement.style.setProperty('--header-height', `${this.offsetHeight}px`);
    }
  }

  customElements.define('sticky-header', StickyHeader);

  /* ------------------------------------------------------------------------
     Quantity stepper.
     ------------------------------------------------------------------------ */

  class QuantityInput extends HTMLElement {
    constructor() {
      super();
      this.input = this.querySelector('.quantity__input');
      this.addEventListener('click', this.handleClick.bind(this));
    }

    handleClick(event) {
      const button = event.target.closest('button');
      if (!button || !this.input) return;

      event.preventDefault();
      const previous = this.input.value;

      if (button.name === 'plus') {
        this.input.stepUp();
      } else {
        this.input.stepDown();
      }

      if (previous !== this.input.value) {
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  customElements.define('quantity-input', QuantityInput);

  /* ------------------------------------------------------------------------
     Country / language selector.
     Sets the hidden field the Shopify localization form expects, then submits.
     ------------------------------------------------------------------------ */

  class LocalizationForm extends DetailsDisclosure {
    constructor() {
      super();
      this.addEventListener('click', this.handleSelection.bind(this));
    }

    handleSelection(event) {
      const button = event.target.closest('.disclosure__link');
      if (!button) return;

      event.preventDefault();
      const form = this.closest('form');
      if (!form) return;

      const input = form.querySelector('input[name="country_code"], input[name="language_code"]');
      if (!input) return;

      input.value = button.dataset.value;
      form.submit();
    }
  }

  customElements.define('localization-form', LocalizationForm);

  /* ------------------------------------------------------------------------
     Address country/province pairing for customer address forms.
     ------------------------------------------------------------------------ */

  class AddressFields extends HTMLElement {
    connectedCallback() {
      this.countrySelect = this.querySelector('[data-country-select]');
      this.provinceSelect = this.querySelector('[data-province-select]');
      this.provinceWrapper = this.querySelector('[data-province-wrapper]');
      if (!this.countrySelect || !this.provinceSelect) return;

      if (this.countrySelect.dataset.default) {
        this.countrySelect.value = this.countrySelect.dataset.default;
      }

      this.countrySelect.addEventListener('change', () => this.updateProvinces());
      this.updateProvinces();
    }

    updateProvinces() {
      const option = this.countrySelect.options[this.countrySelect.selectedIndex];
      const provinces = JSON.parse((option && option.dataset.provinces) || '[]');

      this.provinceSelect.innerHTML = '';

      if (provinces.length === 0) {
        this.provinceWrapper.hidden = true;
        return;
      }

      provinces.forEach(function (province) {
        const opt = document.createElement('option');
        opt.value = province[0];
        opt.textContent = province[1];
        this.provinceSelect.appendChild(opt);
      }, this);

      if (this.provinceSelect.dataset.default) {
        this.provinceSelect.value = this.provinceSelect.dataset.default;
      }

      this.provinceWrapper.hidden = false;
    }
  }

  customElements.define('address-fields', AddressFields);

  /* ------------------------------------------------------------------------
     Small document-level behaviours.
     ------------------------------------------------------------------------ */

  document.addEventListener('click', function (event) {
    const confirmTarget = event.target.closest('[data-confirm]');
    if (confirmTarget && !window.confirm(confirmTarget.dataset.confirm)) {
      event.preventDefault();
      return;
    }

    if (event.target.closest('[data-print]')) window.print();
  });

  /* Search field clear button. */
  document.addEventListener('input', function (event) {
    const input = event.target;
    if (!input.matches('.search-form__input')) return;

    const reset = input.parentElement.querySelector('.search-form__reset');
    if (reset) reset.hidden = input.value.length === 0;
  });

  document.addEventListener('click', function (event) {
    const reset = event.target.closest('.search-form__reset');
    if (!reset) return;

    const field = reset.parentElement.querySelector('.search-form__input');
    if (field) {
      field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
    }
  });
})();
