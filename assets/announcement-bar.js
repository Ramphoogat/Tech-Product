/* ==========================================================================
   Announcement bar: rotation between messages and session dismissal.
   ========================================================================== */

(function () {
  'use strict';

  if (window.__themeAnnouncementLoaded) return;
  window.__themeAnnouncementLoaded = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class AnnouncementBar extends HTMLElement {
    constructor() {
      super();
      this.items = Array.from(this.querySelectorAll('.announcement-bar__item'));
      this.index = 0;
      this.timer = null;

      this.addEventListener('click', this.handleClick.bind(this));
      this.addEventListener('mouseenter', () => this.pause());
      this.addEventListener('mouseleave', () => this.play());
      this.addEventListener('focusin', () => this.pause());
      this.addEventListener('focusout', () => this.play());
    }

    connectedCallback() {
      if (this.dataset.dismissible === 'true' && this.wasDismissed()) {
        this.hidden = true;
        return;
      }

      if (this.dataset.rotate === 'true' && this.items.length > 1 && !reduceMotion) {
        this.play();
      }
    }

    disconnectedCallback() {
      this.pause();
    }

    dismissalKey() {
      return `theme:announcement-dismissed:${this.dataset.sectionId}`;
    }

    wasDismissed() {
      try {
        return window.sessionStorage.getItem(this.dismissalKey()) === '1';
      } catch (error) {
        return false;
      }
    }

    handleClick(event) {
      const dismiss = event.target.closest('.announcement-bar__dismiss');
      if (!dismiss) return;

      try {
        window.sessionStorage.setItem(this.dismissalKey(), '1');
      } catch (error) {
        /* Storage unavailable: the bar still hides for this page view. */
      }

      this.pause();
      this.hidden = true;
    }

    play() {
      if (this.timer || this.items.length < 2) return;

      const seconds = Number(this.dataset.interval) || 5;
      this.timer = window.setInterval(() => this.advance(), seconds * 1000);
    }

    pause() {
      if (!this.timer) return;
      window.clearInterval(this.timer);
      this.timer = null;
    }

    advance() {
      this.items[this.index].classList.remove('is-active');
      this.index = (this.index + 1) % this.items.length;
      this.items[this.index].classList.add('is-active');
    }
  }

  customElements.define('announcement-bar', AnnouncementBar);
})();
