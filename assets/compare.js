/* ==========================================================================
   Product comparison.

   Only product handles are persisted. Every column on the comparison page is
   fetched as <product url>?section_id=compare-column, so the whole table is
   rendered server-side in the active language and market currency; the client
   only decides which products appear and how the rows line up.
   ========================================================================== */

(function () {
  'use strict';

  if (window.__themeCompareLoaded) return;
  window.__themeCompareLoaded = true;

  const STORAGE_KEY = 'theme:compare';
  const theme = window.theme;

  const store = {
    read() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    },

    write(items) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (error) {
        /* Storage unavailable (private mode): comparison stays session-local. */
      }
      document.dispatchEvent(new CustomEvent('compare:changed', { detail: { items } }));
    },

    has(handle) {
      return store.read().some((item) => item.handle === handle);
    },

    add(item) {
      const items = store.read();
      if (items.some((existing) => existing.handle === item.handle)) return true;
      if (items.length >= Number(window.themeSettings.compareLimit)) return false;

      items.push(item);
      store.write(items);
      return true;
    },

    remove(handle) {
      store.write(store.read().filter((item) => item.handle !== handle));
    },

    clear() {
      store.write([]);
    },

    /* Keep titles and thumbnails current for whatever locale the page is in. */
    refresh(handle, title, image) {
      const items = store.read();
      const match = items.find((item) => item.handle === handle);
      if (!match) return;
      if (match.title === title && match.image === image) return;

      match.title = title;
      match.image = image;
      store.write(items);
    },
  };

  function productUrl(handle) {
    const root = window.routes.root_url === '/' ? '' : window.routes.root_url;
    return `${root}/products/${handle}`;
  }

  /* ------------------------------------------------------------------------
     Card checkboxes
     ------------------------------------------------------------------------ */

  function syncToggles() {
    document.querySelectorAll('.compare-toggle__input').forEach(function (input) {
      const handle = input.dataset.compareHandle;
      input.checked = store.has(handle);
      if (input.checked) {
        store.refresh(handle, input.dataset.compareTitle, input.dataset.compareImage);
      }
    });
  }

  document.addEventListener('change', function (event) {
    const input = event.target.closest('.compare-toggle__input');
    if (!input) return;

    const handle = input.dataset.compareHandle;

    if (!input.checked) {
      store.remove(handle);
      return;
    }

    const added = store.add({
      handle: handle,
      title: input.dataset.compareTitle,
      image: input.dataset.compareImage,
    });

    if (!added) {
      input.checked = false;
      const tray = document.querySelector('compare-tray');
      if (tray) tray.showMessage(window.themeStrings.compareLimitReached);
      theme.announce(window.themeStrings.compareLimitReached);
    }
  });

  /* ------------------------------------------------------------------------
     Sticky tray
     ------------------------------------------------------------------------ */

  class CompareTray extends HTMLElement {
    constructor() {
      super();
      this.list = this.querySelector('.compare-tray__items');
      this.count = this.querySelector('.compare-tray__count');
      this.goButton = this.querySelector('.compare-tray__go');

      this.addEventListener('click', this.handleClick.bind(this));
    }

    connectedCallback() {
      this.render();
      document.addEventListener('compare:changed', () => this.render());
    }

    handleClick(event) {
      if (event.target.closest('.compare-tray__clear')) {
        store.clear();
        syncToggles();
        return;
      }

      const remove = event.target.closest('.compare-tray__chip-remove');
      if (remove) {
        store.remove(remove.dataset.handle);
        syncToggles();
      }
    }

    showMessage(message) {
      let element = this.querySelector('.compare-tray__message');
      if (!element) {
        element = document.createElement('p');
        element.className = 'compare-tray__message';
        this.querySelector('.compare-tray__inner').appendChild(element);
      }
      element.textContent = message;
    }

    render() {
      const items = store.read();

      this.hidden = items.length === 0;
      document.body.classList.toggle('has-compare-tray', items.length > 0);

      const message = this.querySelector('.compare-tray__message');
      if (message) message.textContent = '';

      if (this.count) this.count.textContent = String(items.length);
      if (this.goButton) this.goButton.hidden = items.length < 2;

      if (!this.list) return;
      this.list.innerHTML = '';

      items.forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'compare-tray__chip';

        if (item.image) {
          const img = document.createElement('img');
          img.src = item.image;
          img.alt = '';
          img.width = 28;
          img.height = 28;
          li.appendChild(img);
        }

        const title = document.createElement('span');
        title.className = 'compare-tray__chip-title';
        title.textContent = item.title || item.handle;
        li.appendChild(title);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'compare-tray__chip-remove';
        button.dataset.handle = item.handle;
        button.setAttribute(
          'aria-label',
          window.themeStrings.compareRemove.replace('@@P@@', item.title || item.handle)
        );
        button.innerHTML =
          '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        li.appendChild(button);

        this.list.appendChild(li);
      }, this);
    }
  }

  customElements.define('compare-tray', CompareTray);

  /* ------------------------------------------------------------------------
     Comparison table
     ------------------------------------------------------------------------ */

  class CompareTable extends HTMLElement {
    constructor() {
      super();
      this.output = this.querySelector('[data-compare-output]');
      this.empty = this.querySelector('[data-compare-empty]');
      this.loading = this.querySelector('[data-compare-loading]');

      this.addEventListener('click', function (event) {
        const remove = event.target.closest('.compare-table__remove');
        if (!remove) return;
        store.remove(remove.dataset.handle);
        syncToggles();
      });
    }

    connectedCallback() {
      this.render();
      document.addEventListener('compare:changed', () => this.render());
    }

    async fetchColumn(handle) {
      const doc = await theme.fetchSection(`${productUrl(handle)}?section_id=compare-column`);
      const column = doc.querySelector('.compare-column');
      if (!column) return null;

      return {
        handle: handle,
        header: column.querySelector('.compare-column__header').outerHTML,
        footer: column.querySelector('.compare-column__footer').innerHTML,
        title: column.dataset.title,
        specs: Array.from(column.querySelectorAll('.compare-spec')).map(function (spec) {
          return {
            label: spec.dataset.label,
            value: spec.querySelector('.compare-spec__value').innerHTML,
          };
        }),
      };
    }

    async render() {
      const items = store.read();

      if (items.length === 0) {
        this.output.innerHTML = '';
        this.empty.hidden = false;
        return;
      }

      this.empty.hidden = true;
      this.loading.hidden = false;

      try {
        const results = await Promise.all(items.map((item) => this.fetchColumn(item.handle)));
        const columns = results.filter(Boolean);
        this.output.innerHTML = columns.length ? this.buildTable(columns) : '';
      } catch (error) {
        theme.announce(window.themeStrings.error);
      } finally {
        this.loading.hidden = true;
      }
    }

    buildTable(columns) {
      const labels = [];
      columns.forEach(function (column) {
        column.specs.forEach(function (spec) {
          if (labels.indexOf(spec.label) === -1) labels.push(spec.label);
        });
      });

      const head = columns
        .map(function (column) {
          const removeLabel = window.themeStrings.compareRemove.replace('@@P@@', column.title);
          return `<th scope="col">${column.header}
            <button type="button" class="compare-table__remove" data-handle="${column.handle}">${removeLabel}</button>
          </th>`;
        })
        .join('');

      const body = labels
        .map(function (label) {
          const cells = columns
            .map(function (column) {
              const match = column.specs.find((spec) => spec.label === label);
              return `<td>${match ? match.value : '&mdash;'}</td>`;
            })
            .join('');
          return `<tr><th scope="row" class="compare-table__row-label">${label}</th>${cells}</tr>`;
        })
        .join('');

      const footer = columns.map((column) => `<td>${column.footer}</td>`).join('');

      return `<table class="compare-table">
        <thead><tr><td></td>${head}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td></td>${footer}</tr></tfoot>
      </table>`;
    }
  }

  customElements.define('compare-table', CompareTable);

  document.addEventListener('DOMContentLoaded', syncToggles);
})();
