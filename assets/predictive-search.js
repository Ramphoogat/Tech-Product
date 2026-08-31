/* ==========================================================================
   Predictive search.
   Results are rendered by sections/predictive-search.liquid through
   routes.predictive_search_url, which is locale-aware, so suggestions come
   back in the shopper's language with market-correct prices.
   ========================================================================== */

(function () {
  'use strict';

  if (window.__themePredictiveLoaded) return;
  window.__themePredictiveLoaded = true;

  const theme = window.theme;
  const MIN_LENGTH = 2;

  class PredictiveSearch extends HTMLElement {
    constructor() {
      super();
      this.input = this.querySelector('input[type="search"]');
      this.results = this.querySelector('[data-predictive-search]');
      this.status = this.querySelector('[data-predictive-status]');
      this.selectedIndex = -1;

      if (!this.input || !this.results) return;

      this.input.addEventListener('input', theme.debounce(this.handleInput.bind(this), 250));
      this.input.addEventListener('keydown', this.handleKeyDown.bind(this));
      this.addEventListener('focusout', this.handleFocusOut.bind(this));
    }

    get options() {
      return Array.from(this.results.querySelectorAll('[role="option"]'));
    }

    handleInput() {
      const term = this.input.value.trim();
      if (term.length < MIN_LENGTH) {
        this.close();
        return;
      }
      this.search(term);
    }

    handleFocusOut(event) {
      if (!this.contains(event.relatedTarget)) this.close();
    }

    handleKeyDown(event) {
      switch (event.key) {
        case 'Escape':
          this.close();
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.move(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.move(-1);
          break;
        case 'Enter': {
          const option = this.options[this.selectedIndex];
          if (option) {
            event.preventDefault();
            const link = option.querySelector('a');
            if (link) window.location.href = link.href;
          }
          break;
        }
        default:
          break;
      }
    }

    move(direction) {
      const options = this.options;
      if (options.length === 0) return;

      this.selectedIndex = (this.selectedIndex + direction + options.length) % options.length;

      options.forEach((option, index) => {
        const selected = index === this.selectedIndex;
        option.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (selected) {
          this.input.setAttribute('aria-activedescendant', option.id);
          option.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    async search(term) {
      const url = new URL(window.routes.predictive_search_url, window.location.origin);
      url.searchParams.set('q', term);
      url.searchParams.set('section_id', 'predictive-search');
      url.searchParams.set('resources[type]', 'product,collection,page,article,query');
      url.searchParams.set('resources[limit]', '5');

      try {
        const doc = await theme.fetchSection(url.toString());
        const section = doc.querySelector('#shopify-section-predictive-search');
        this.results.innerHTML = section ? section.innerHTML : '';
        this.open();

        const announcement = this.results.querySelector('[data-predictive-announce]');
        if (this.status && announcement) this.status.textContent = announcement.textContent.trim();
      } catch (error) {
        this.close();
      }
    }

    open() {
      this.results.hidden = false;
      this.input.setAttribute('aria-expanded', 'true');
      this.selectedIndex = -1;
      this.input.removeAttribute('aria-activedescendant');
    }

    close() {
      this.results.hidden = true;
      this.results.innerHTML = '';
      this.input.setAttribute('aria-expanded', 'false');
      this.input.removeAttribute('aria-activedescendant');
      this.selectedIndex = -1;
      if (this.status) this.status.textContent = '';
    }
  }

  customElements.define('predictive-search', PredictiveSearch);
})();
