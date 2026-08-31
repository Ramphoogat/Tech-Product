/* ==========================================================================
   Faceted filtering and sorting.
   The form is a plain GET form; this upgrades it to fetch the collection or
   search section through the Section Rendering API and swap the results in.
   ========================================================================== */

(function () {
  'use strict';

  if (window.__themeFacetsLoaded) return;
  window.__themeFacetsLoaded = true;

  const theme = window.theme;

  class FacetFiltersForm extends HTMLElement {
    constructor() {
      super();
      this.sectionId = this.dataset.section;
      this.form = this.querySelector('form');
      this.panel = this.querySelector('.facets-panel');

      this.addEventListener('change', theme.debounce(this.handleChange.bind(this), 400));
      this.addEventListener('click', this.handleClick.bind(this));
      this.addEventListener('submit', this.handleSubmit.bind(this));
    }

    connectedCallback() {
      if (!window.__themeFacetsPopstate) {
        window.__themeFacetsPopstate = true;
        window.addEventListener('popstate', function () {
          const element = document.querySelector('facet-filters-form');
          if (element) element.render(window.location.href, false);
        });
      }
    }

    handleSubmit(event) {
      event.preventDefault();
      this.render(this.buildUrl(), true);
    }

    handleChange() {
      this.render(this.buildUrl(), true);
    }

    handleClick(event) {
      if (event.target.closest('.js-facets-open')) {
        this.openPanel(event.target.closest('.js-facets-open'));
        return;
      }

      if (event.target.closest('.js-facets-close')) {
        this.closePanel();
        return;
      }

      const more = event.target.closest('.js-facet-more');
      if (more) {
        const list = more.parentElement.querySelector('.facet__values');
        const expanded = list.classList.toggle('is-expanded');
        more.setAttribute('aria-expanded', String(expanded));
        more.querySelector('[data-more]').hidden = expanded;
        more.querySelector('[data-less]').hidden = !expanded;
        return;
      }

      /* Active filter chips and the clear link are links: intercept them. */
      const chip = event.target.closest('.active-facets__chip, .active-facets__clear');
      if (chip) {
        event.preventDefault();
        this.render(chip.href, true);
      }
    }

    openPanel(opener) {
      if (!this.panel) return;
      this.opener = opener;
      this.panel.classList.add('is-open');
      opener.setAttribute('aria-expanded', 'true');
      theme.lockScroll(true);
      theme.trapFocus(this.panel, this.panel.querySelector('.js-facets-close'));
    }

    closePanel() {
      if (!this.panel) return;
      this.panel.classList.remove('is-open');
      theme.lockScroll(false);
      if (this.opener) this.opener.setAttribute('aria-expanded', 'false');
      theme.removeTrapFocus(this.opener);
    }

    buildUrl() {
      const params = new URLSearchParams();

      new FormData(this.form).forEach(function (value, key) {
        if (String(value).trim() !== '') params.append(key, value);
      });

      const action = this.form.getAttribute('action').split('?')[0];
      const query = params.toString();
      return query ? `${action}?${query}` : action;
    }

    rememberFocus() {
      const active = document.activeElement;
      if (!active || !this.contains(active)) return null;
      return { name: active.getAttribute('name'), value: active.value, id: active.id };
    }

    restoreFocus(marker, panelWasOpen) {
      if (panelWasOpen) {
        const opener = this.querySelector('.js-facets-open');
        if (opener) this.openPanel(opener);
      }

      if (!marker) return;

      const selector = marker.id
        ? `#${CSS.escape(marker.id)}`
        : `[name="${marker.name}"][value="${marker.value}"]`;
      const element = this.querySelector(selector);
      if (element) element.focus();
    }

    async render(url, updateHistory) {
      const results = document.getElementById(`ProductGridContainer-${this.sectionId}`);
      const facets = document.getElementById(`FacetsContainer-${this.sectionId}`);
      if (!results) return;

      const marker = this.rememberFocus();
      const panelWasOpen = this.panel && this.panel.classList.contains('is-open');

      results.classList.add('is-loading');

      try {
        const separator = url.indexOf('?') === -1 ? '?' : '&';
        const doc = await theme.fetchSection(`${url}${separator}section_id=${this.sectionId}`);

        const newResults = doc.getElementById(`ProductGridContainer-${this.sectionId}`);
        if (newResults) results.innerHTML = newResults.innerHTML;

        const newFacets = doc.getElementById(`FacetsContainer-${this.sectionId}`);
        if (newFacets && facets) facets.innerHTML = newFacets.innerHTML;

        if (updateHistory) window.history.pushState({ facets: true }, '', url);

        const count = document.getElementById(`FacetsCount-${this.sectionId}`);
        if (count) theme.announce(count.textContent.trim());

        const next = document.querySelector(`facet-filters-form[data-section="${this.sectionId}"]`);
        if (next) next.restoreFocus(marker, panelWasOpen);
      } catch (error) {
        theme.announce(window.themeStrings.error);
      } finally {
        results.classList.remove('is-loading');
      }
    }
  }

  customElements.define('facet-filters-form', FacetFiltersForm);
})();
