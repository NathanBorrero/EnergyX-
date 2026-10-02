/* generado desde src/theme/ne-components.js — no editar, ver scripts/sync-theme-assets.mjs */
import { createVariantMatrix, VALUE_STATUS } from 'ne/variant-matrix';
import { recommendSize, reconcileWithStock, CONFIDENCE } from 'ne/size-advisor';
import { sizeFitAttributes } from 'ne/cart-line';
import { createSizeSelectionTracker } from 'ne/size-selected-event';
import { foldKey } from 'ne/semantics';

function readJson(root, selector) {
  try {
    const node = root.querySelector(selector);
    if (!node || !node.textContent) return null;
    return JSON.parse(node.textContent);
  } catch (error) {
    report('json', selector, error);
    return null;
  }
}

const STRINGS = readJson(document, '#ne-strings') ?? {};
const ROUTES = readJson(document, '#ne-routes') ?? {};

const CONFIG = readJson(document, '#ne-config') ?? {};

function text(key, vars) {
  let out = typeof STRINGS[key] === 'string' ? STRINGS[key] : '';
  if (vars) {
    for (const name of Object.keys(vars)) {
      out = out.split(`[[${name}]]`).join(String(vars[name]));
    }
  }
  return out;
}

function report(scope, detail, error) {
  const entry = { scope, detail, message: error instanceof Error ? error.message : String(error) };
  const bag = (globalThis.__ne_errors = globalThis.__ne_errors ?? []);
  bag.push(entry);
  if (bag.length > 50) bag.shift();
}

function define(name, ctor) {
  try {
    if (!customElements.get(name)) customElements.define(name, ctor);
  } catch (error) {
    report('define', name, error);
  }
}

function mountSoon(work) {

  setTimeout(work, 0);
}

function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

function parseMeasurement(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const SIZE_OPTION_KEYS = new Set([foldKey('talla'), foldKey('size')]);

function findSizeOption(optionNames) {
  for (const name of optionNames) {
    if (SIZE_OPTION_KEYS.has(foldKey(name))) return name;
  }
  return null;
}

const EVENT = Object.freeze({
  VARIANT_CHANGE: 'ne:variant-change',
  SELECT_SIZE: 'ne:select-size',
  REQUEST_STATE: 'ne:request-state',
  CART_UPDATED: 'ne:cart-updated',
});

class NeVariantPicker extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    try {
      this.#mount();
      this.dataset.neMounted = 'true';
    } catch (error) {
      report('variant-picker', 'mount', error);
    }
  }

  #mount() {
    const variants = readJson(this, 'script[data-ne-variants]');
    if (!Array.isArray(variants) || variants.length === 0) return;

    this.matrix = createVariantMatrix(variants);
    if (this.matrix.optionNames.length === 0) return;

    this.byId = new Map(variants.map((v) => [String(v.id), v]));

    this.variantSelect = this.querySelector('[data-ne-variant-select]');
    this.message = this.querySelector('[data-ne-picker-message]');
    this.inputs = Array.from(this.querySelectorAll('[data-ne-option-input]'));
    if (this.inputs.length === 0 || !this.variantSelect) return;

    this.sizeOption = findSizeOption(this.matrix.optionNames);
    this.tracker = createSizeSelectionTracker({
      sizeOptionName: this.sizeOption ?? undefined,
      publish: CONFIG.sizeSelectedEvent === false ? null : undefined,
    });
    this.productRoot = this.closest('[data-ne-product]') ?? document;
    this.productId = this.productRoot?.dataset?.neProductId || '';
    this.productHandle = this.productRoot?.dataset?.neProductHandle || '';

    this.selection = this.#initialSelection();

    this.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-ne-option-input')) return;
      this.#choose(input.dataset.neOptionName ?? '', input.value, 'picker');
    });

    this.productRoot.addEventListener(EVENT.SELECT_SIZE, (event) => {
      const wanted = event?.detail?.size;
      if (!this.sizeOption || typeof wanted !== 'string') return;
      this.#choose(this.sizeOption, wanted, 'size-guide');
    });

    this.productRoot.addEventListener(EVENT.REQUEST_STATE, () => this.#announce('request'));

    this.dataset.neEnhanced = 'true';

    this.#paint();
    this.#announce('init');
  }

  #initialSelection() {
    const fromMarkup = {};
    for (const input of this.inputs) {
      if (input.checked && input.dataset.neOptionName) {
        fromMarkup[input.dataset.neOptionName] = input.value;
      }
    }
    if (this.matrix.resolve(fromMarkup)) return fromMarkup;

    const fromSelect = this.byId.get(String(this.variantSelect?.value ?? ''));
    if (fromSelect && Array.isArray(fromSelect.selectedOptions)) {
      const sel = {};
      for (const o of fromSelect.selectedOptions) sel[o.name] = o.value;
      if (this.matrix.resolve(sel)) return sel;
    }

    return this.matrix.firstAvailableSelection() ?? fromMarkup;
  }

  #choose(optionName, value, source) {
    const canonical = this.matrix.optionNames.find((n) => foldKey(n) === foldKey(optionName));
    if (!canonical) return;

    this.selection = this.matrix.reconcile({ ...this.selection, [canonical]: value }, canonical);
    this.#paint();
    this.#announce(source, canonical);
  }

  #paint() {
    for (const input of this.inputs) {
      const optionName = input.dataset.neOptionName ?? '';
      const status = this.matrix.statusFor(optionName, input.value, this.selection);
      const chip = input.closest('.ne-picker__chip');
      const selected = foldKey(this.selection[optionName] ?? '') === foldKey(input.value);

      input.checked = selected;

      input.disabled = false;

      if (chip instanceof HTMLElement) {
        chip.dataset.neState = status;
        const note = chip.querySelector('[data-ne-chip-state]');
        if (note) note.textContent = this.#stateLabel(status, selected);
      }
    }

    for (const group of this.querySelectorAll('[data-ne-option]')) {
      const optionName = group.getAttribute('data-ne-option') ?? '';
      const chosen = group.querySelector('[data-ne-chosen]');
      if (chosen) chosen.textContent = this.selection[optionName] ?? '';
    }

    const variant = this.matrix.resolve(this.selection);
    this.#syncVariant(variant);
  }

  #stateLabel(status, selected) {
    const parts = [];
    if (selected) parts.push(text('selected'));
    if (status === VALUE_STATUS.UNAVAILABLE) parts.push(text('unavailable'));
    if (status === VALUE_STATUS.NONEXISTENT) parts.push(text('nonexistent'));
    return parts.join(', ');
  }

  #syncVariant(variant) {
    const button = this.productRoot.querySelector?.('[data-ne-add-to-cart]');
    const label = this.productRoot.querySelector?.('[data-ne-add-label]');
    const incomplete = this.matrix.optionNames.filter((n) => this.selection[n] === undefined);

    if (this.variantSelect) {
      if (variant) this.variantSelect.value = String(variant.id);
      this.variantSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (this.message) {
      if (incomplete.length > 0) {
        this.message.textContent = text('choose_option', { option: incomplete.join(' · ') });
        this.message.hidden = false;
      } else {
        this.message.hidden = true;
        this.message.textContent = '';
      }
    }

    const buyable = Boolean(variant && variant.availableForSale);
    if (button instanceof HTMLButtonElement) button.disabled = !buyable;
    if (label) {
      label.textContent = buyable
        ? text('add_to_cart')
        : variant
          ? text('sold_out')
          : text('add_to_cart');
    }

    if (variant) {
      const price = this.productRoot.querySelector?.('[data-ne-price-current]');
      if (price && typeof variant.priceFormatted === 'string') price.innerHTML = variant.priceFormatted;

      const compare = this.productRoot.querySelector?.('.ne-price__compare');
      if (compare) {
        if (typeof variant.compareAtPriceFormatted === 'string') {
          compare.innerHTML = variant.compareAtPriceFormatted;
          compare.hidden = false;
        } else {
          compare.hidden = true;
        }
      }

      const sku = this.productRoot.querySelector?.('[data-ne-sku]');
      if (sku) sku.textContent = typeof variant.sku === 'string' ? variant.sku : '';

      this.#updateUrl(variant.id);
    }

    this.currentVariant = variant ?? null;
  }

  #updateUrl(variantId) {
    try {
      const url = new URL(globalThis.location.href);
      if (url.searchParams.get('variant') === String(variantId)) return;
      url.searchParams.set('variant', String(variantId));
      globalThis.history.replaceState({}, '', url.toString());
    } catch (error) {
      report('variant-picker', 'url', error);
    }
  }

  #announce(source, changedOption) {
    const sizeValue = this.sizeOption ? this.selection[this.sizeOption] : undefined;
    const purchasableSizes = this.sizeOption
      ? this.matrix.purchasableValuesFor(this.sizeOption, this.#selectionWithout(this.sizeOption))
      : [];

    this.dispatchEvent(
      new CustomEvent(EVENT.VARIANT_CHANGE, {
        bubbles: true,
        detail: {
          selection: { ...this.selection },
          variant: this.currentVariant ?? null,
          sizeOption: this.sizeOption,
          size: sizeValue ?? null,
          purchasableSizes,
          source,
        },
      }),
    );

    if (this.sizeOption && changedOption === this.sizeOption && typeof sizeValue === 'string') {
      this.tracker.track({
        size: sizeValue,
        status: this.matrix.statusFor(this.sizeOption, sizeValue, this.#selectionWithout(this.sizeOption)),
        context: {
          productId: this.productId || undefined,
          productHandle: this.productHandle || undefined,
          variantId: this.currentVariant ? String(this.currentVariant.id) : undefined,
          source,
        },
      });
    }
  }

  #selectionWithout(optionName) {
    const copy = { ...this.selection };
    delete copy[optionName];
    return copy;
  }
}

define('ne-variant-picker', NeVariantPicker);

class NeSizeGuide extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    this.dataset.neMounted = 'true';
    mountSoon(() => this.#mountGuarded());
  }

  #mountGuarded() {
    try {
      this.#mount();
    } catch (error) {
      report('size-guide', 'mount', error);
    }
  }

  #mount() {
    this.chart = readJson(this, 'script[data-ne-size-chart]');
    this.productRoot = this.closest('[data-ne-product]') ?? document;
    this.recommendOutput = this.querySelector('[data-ne-recommendation]');
    this.footInput = this.querySelector('[data-ne-foot-input]');
    this.recommendButton = this.querySelector('[data-ne-recommend]');

    this.recommended = null;
    this.footLengthCm = null;
    this.opened = false;
    this.purchasableSizes = [];
    this.chosenSize = null;

    const details = this.querySelector('details');
    details?.addEventListener('toggle', () => {
      if (details.open) {
        this.opened = true;
        this.#writeAttributes();
      }
    });

    this.productRoot.addEventListener(EVENT.VARIANT_CHANGE, (event) => {
      const detail = event?.detail;
      if (!detail) return;
      this.purchasableSizes = Array.isArray(detail.purchasableSizes) ? detail.purchasableSizes : [];
      this.chosenSize = typeof detail.size === 'string' ? detail.size : null;
      this.#writeAttributes();
    });

    if (this.dataset.neRecommender !== 'on' || !Array.isArray(this.chart) || this.chart.length === 0) {
      return;
    }

    this.recommendButton?.addEventListener('click', () => this.#recommend());
    this.footInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.#recommend();
      }
    });

    this.dataset.neEnhanced = 'true';

    this.productRoot.dispatchEvent(new CustomEvent(EVENT.REQUEST_STATE, { bubbles: true }));
  }

  #recommend() {
    const cm = parseMeasurement(this.footInput?.value ?? '');
    if (cm === null) {
      this.#say(text('invalid_measurement'));
      return;
    }

    const raw = recommendSize(cm, this.chart);
    const final = reconcileWithStock(raw, this.purchasableSizes, this.chart);

    this.footLengthCm = cm;
    this.recommended = final.label;

    this.#say(this.#messageFor(final, raw));
    this.#writeAttributes();

    if (final.label && this.purchasableSizes.some((s) => foldKey(s) === foldKey(final.label))) {
      this.#offerToApply(final.label);
    }
  }

  #messageFor(final, raw) {
    if (final.substituted && final.label) {
      return text('recommended_substituted', { size: final.label, original: raw.label ?? '' });
    }
    if (final.reason === 'recommended_out_of_stock') return text('recommended_out_of_stock');
    if (final.confidence === CONFIDENCE.NO_DATA) return text('no_data');
    if (final.confidence === CONFIDENCE.OUT_OF_RANGE || !final.label) return text('out_of_range');
    if (final.confidence === CONFIDENCE.ROUNDED) {
      return text('recommended_rounded', { size: final.label });
    }
    return text('recommended', { size: final.label });
  }

  #say(message) {
    if (!this.recommendOutput) return;
    this.recommendOutput.textContent = message;
    this.recommendOutput.hidden = message === '';
  }

  #offerToApply(size) {
    let apply = this.querySelector('[data-ne-apply-size]');
    if (!apply) {
      apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'ne-button ne-button--quiet ne-sizeguide__apply';
      apply.setAttribute('data-ne-apply-size', '');
      this.recommendOutput?.insertAdjacentElement('afterend', apply);
      apply.addEventListener('click', () => {
        this.productRoot.dispatchEvent(
          new CustomEvent(EVENT.SELECT_SIZE, {
            bubbles: true,
            detail: { size: apply.dataset.neApplySize },
          }),
        );
      });
    }
    apply.dataset.neApplySize = size;
    apply.textContent = text('choose_size', { size });
    apply.hidden = false;
  }

  #writeAttributes() {
    const attrs = sizeFitAttributes({
      chosenSize: this.chosenSize ?? undefined,
      recommendedSize: this.recommended ?? undefined,
      footLengthCm: this.footLengthCm ?? undefined,
      usedSizeGuide: this.opened ? true : undefined,
    });

    const container = this.productRoot.querySelector?.('[data-ne-product-form]');
    const form = container instanceof HTMLFormElement ? container : container?.querySelector('form');
    if (!form) return;

    for (const field of form.querySelectorAll('[data-ne-attr]')) {
      const key = field.getAttribute('data-ne-attr') ?? '';
      const value = attrs[key];
      if (typeof value === 'string' && value !== '') {
        field.value = value;
        field.disabled = false;
      } else {
        field.value = '';
        field.disabled = true;
      }
    }

    for (const key of Object.keys(attrs)) {
      if (!form.querySelector(`[data-ne-attr="${key}"]`)) {
        report('size-guide', `atribución sin campo en el formulario: ${key}`, new Error('marcado incompleto'));
      }
    }
  }
}

define('ne-size-guide', NeSizeGuide);

class NeProductGallery extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    this.dataset.neMounted = 'true';
    mountSoon(() => this.#mountGuarded());
  }

  #mountGuarded() {
    try {
      this.#mount();
    } catch (error) {
      report('gallery', 'mount', error);
    }
  }

  #mount() {
    this.#enhanceVideoFacades();

    this.trigger = this.querySelector('[data-ne-model-trigger]');
    this.arTrigger = this.querySelector('[data-ne-ar-trigger]');
    this.modelSlot = this.querySelector('[data-ne-model-slot]');
    this.fallback = this.querySelector('[data-ne-model-fallback]');
    this.modelError = this.querySelector('[data-ne-model-error]');

    if (!this.modelSlot || !this.trigger) return;

    const mode = this.dataset.neModelMode ?? 'on_demand';
    if (mode === 'off' || !this.#canRender3d()) {
      this.trigger.hidden = true;
      this.arTrigger?.setAttribute('hidden', '');
      return;
    }

    this.viewer = this.modelSlot.querySelector('model-viewer');
    this.isOpen = false;

    this.trigger.addEventListener('click', () => this.#toggle());
    this.trigger.hidden = false;
    this.dataset.neEnhanced = 'true';

    if (mode === 'eager' && !prefersReducedMotion() && !this.#deviceIsModest()) {
      this.#toggle();
    }
  }

  #enhanceVideoFacades() {
    for (const facade of this.querySelectorAll('[data-ne-video-facade]')) {
      const play = facade.querySelector('[data-ne-video-play]');
      const template = facade.querySelector('[data-ne-video-embed]');
      if (!play || !template) continue;

      play.addEventListener(
        'click',
        () => {
          try {
            facade.replaceChildren(template.content.cloneNode(true));
            facade.querySelector('iframe')?.focus?.();
          } catch (error) {
            report('gallery', 'video-facade', error);
          }
        },
        { once: true },
      );
    }
  }

  #canRender3d() {
    try {
      if (globalThis.navigator?.connection?.saveData === true) return false;
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      return Boolean(gl);
    } catch {
      return false;
    }
  }

  #deviceIsModest() {
    const nav = globalThis.navigator ?? {};
    if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
    const effective = nav.connection?.effectiveType;
    if (typeof effective === 'string' && /^(slow-2g|2g|3g)$/.test(effective)) return true;

    try {
      if (globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches) return true;
    } catch {
    }
    return false;
  }

  #watchVisibility() {
    if (typeof IntersectionObserver !== 'function') return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || !this.isOpen) continue;
          this.#toggle();
          this.#release();
        }
      },
      { rootMargin: '200px 0px', threshold: 0 },
    );
    this.observer.observe(this.modelSlot);
  }

  #release() {
    const viewer = this.viewer;
    if (!viewer) return;
    try {
      if (typeof viewer.pause === 'function') viewer.pause();
      if (typeof viewer.showPoster === 'function') viewer.showPoster();
    } catch (error) {
      report('gallery', 'release', error);
    }
  }

  disconnectedCallback() {
    try {
      this.observer?.disconnect();
      this.#release();
    } catch (error) {
      report('gallery', 'disconnect', error);
    }
  }

  #toggle() {
    this.isOpen = !this.isOpen;
    this.modelSlot.hidden = !this.isOpen;
    if (this.fallback) this.fallback.hidden = this.isOpen;
    this.trigger.setAttribute('aria-expanded', String(this.isOpen));
    this.trigger.textContent = this.isOpen ? text('hide_3d') : text('view_3d');

    if (this.isOpen) this.#reveal();
  }

  #reveal() {
    const viewer = this.viewer;
    if (!viewer) {
      this.#fail();
      return;
    }

    this.trigger.dataset.neLoading = 'true';
    this.trigger.textContent = text('view_3d_loading');
    const settle = (ok) => {
      clearTimeout(timer);
      delete this.trigger.dataset.neLoading;
      this.trigger.textContent = text('hide_3d');
      if (!ok) this.#fail();
      else this.#offerAr(viewer);
    };

    this.#watchVisibility();

    const timer = setTimeout(() => settle(false), 12000);
    viewer.addEventListener('load', () => settle(true), { once: true });
    viewer.addEventListener('error', () => settle(false), { once: true });

    try {
      viewer.dismissPoster?.();
    } catch (error) {
      report('gallery', 'dismissPoster', error);
    }
  }

  #offerAr(viewer) {
    if (!this.arTrigger) return;
    if (viewer.canActivateAR !== true) return;
    this.arTrigger.hidden = false;
    this.arTrigger.addEventListener(
      'click',
      () => {
        try {
          viewer.activateAR?.();
        } catch (error) {
          report('gallery', 'activateAR', error);
        }
      },
      { once: false },
    );
  }

  #fail() {
    this.isOpen = false;
    this.modelSlot.hidden = true;
    if (this.fallback) this.fallback.hidden = false;
    if (this.modelError) this.modelError.hidden = false;
    this.trigger.hidden = true;
    this.arTrigger?.setAttribute('hidden', '');
  }
}

define('ne-product-gallery', NeProductGallery);

class NeCart extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    try {
      this.#mount();
      this.dataset.neMounted = 'true';
    } catch (error) {
      report('cart', 'mount', error);
    }
  }

  #mount() {
    if (!ROUTES.cart_change) return; // Sin ruta de Shopify no se inventa una.

    this.status = this.querySelector('[data-ne-cart-status]');
    this.failure = this.querySelector('[data-ne-cart-error]');
    this.busy = false;

    this.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-ne-line-qty')) return;
      const key = input.closest('[data-ne-line-key]')?.dataset?.neLineKey;
      const quantity = Number.parseInt(input.value, 10);
      if (!key || !Number.isFinite(quantity) || quantity < 0) return;
      event.preventDefault();
      this.#change(key, quantity);
    });

    this.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('[data-ne-line-remove]') : null;
      if (!link) return;
      const key = link.closest('[data-ne-line-key]')?.dataset?.neLineKey;
      if (!key) return;
      event.preventDefault();
      this.#change(key, 0);
    });

    this.dataset.neEnhanced = 'true';
  }

  async #change(key, quantity) {
    if (this.busy) return;
    this.busy = true;
    this.dataset.neBusy = 'true';
    if (this.status) this.status.textContent = text('cart_updating');
    if (this.failure) this.failure.hidden = true;

    const sections = [
      this.dataset.neSectionId,
      document.querySelector('[data-ne-header]')?.dataset?.neSectionId,
    ].filter(Boolean);

    try {
      const response = await fetch(ROUTES.cart_change, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: key,
          quantity,
          sections,
          sections_url: globalThis.location.pathname,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          (payload && typeof payload.description === 'string' && payload.description) ||
          (payload && typeof payload.message === 'string' && payload.message) ||
          text('error_cart_update');
        throw new Error(message);
      }

      if (this.status) this.status.textContent = text('cart_updated');
      document.dispatchEvent(new CustomEvent(EVENT.CART_UPDATED, { detail: { payload } }));

      applyRenderedSections(payload?.sections);
    } catch (caught) {
      report('cart', 'change', caught);
      if (this.failure) {
        const offline = caught instanceof TypeError || globalThis.navigator?.onLine === false;
        this.failure.textContent = offline
          ? text('error_network')
          : caught instanceof Error && caught.message
            ? caught.message
            : text('error_cart_update');
        this.failure.hidden = false;
      }
      if (this.status) this.status.textContent = '';
    } finally {
      this.busy = false;
      delete this.dataset.neBusy;
    }
  }
}

define('ne-cart', NeCart);

class NeCodCoverage extends HTMLElement {
  connectedCallback() {
    if (this.dataset.neMounted === 'true') return;
    this.dataset.neMounted = 'true';
    mountSoon(() => this.#mountGuarded());
  }

  #mountGuarded() {
    this.#mount().catch((error) => report('cod', 'mount', error));
  }

  async #mount() {
    this.placeInput = this.querySelector('[data-ne-cod-input]');
    this.result = this.querySelector('[data-ne-cod-result]');
    const button = this.querySelector('[data-ne-cod-check]');
    if (!this.placeInput || !this.result || !button) return;

    this.cod = await import('ne/cod-guard');

    this.coverage = Array.isArray(CONFIG.codCoverage) ? CONFIG.codCoverage : [];

    button.addEventListener('click', () => this.#check());
    this.placeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.#check();
      }
    });

    this.dataset.neEnhanced = 'true';
  }

  #check() {
    if (!this.cod) return; // El módulo aún no ha llegado.
    const { checkCodCoverage, FIELD_STATUS } = this.cod;
    const place = (this.placeInput.value ?? '').trim();
    const outcome = checkCodCoverage(place, this.coverage);

    let message = '';
    if (outcome.status === FIELD_STATUS.OK) {
      message = text('cod_covered', { place });
    } else if (outcome.status === FIELD_STATUS.NOT_COVERED) {
      message = text('cod_not_covered', { place });
    } else if (outcome.status === FIELD_STATUS.MISSING) {
      message = text('cod_missing');
    }

    this.result.textContent = message;
    this.result.hidden = message === '';
  }
}

define('ne-cod-coverage', NeCodCoverage);

function enhanceBuyForms(root = document) {
  for (const container of root.querySelectorAll('[data-ne-product-form]')) {
    const form = container instanceof HTMLFormElement ? container : container.querySelector('form');
    if (!form) continue;
    if (form.dataset.neEnhanced === 'true') continue;
    if (!ROUTES.cart_add) continue; // Sin ruta de Shopify no se inventa una.
    form.dataset.neEnhanced = 'true';

    form.addEventListener('submit', async (event) => {
      const button = form.querySelector('[data-ne-add-to-cart]');
      const label = form.querySelector('[data-ne-add-label]');
      const error = form.querySelector('[data-ne-buy-error]');
      const status = form.querySelector('[data-ne-buy-status]');

      const data = new FormData(form);
      if (!data.get('id')) return;

      event.preventDefault();

      const previous = label?.textContent ?? '';
      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
        button.dataset.neLoading = 'true';
      }
      if (label) label.textContent = text('adding');
      if (error) error.hidden = true;

      const headerId = document.querySelector('[data-ne-header]')?.dataset?.neSectionId;
      if (headerId) {
        data.set('sections', headerId);
        data.set('sections_url', globalThis.location.pathname);
      }

      try {
        const response = await fetch(ROUTES.cart_add, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: data,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            (payload && typeof payload.description === 'string' && payload.description) ||
            (payload && typeof payload.message === 'string' && payload.message) ||
            text('error_add_to_cart');
          throw new Error(message);
        }

        applyRenderedSections(payload?.sections);
        if (label) label.textContent = text('added');
        if (status) status.textContent = text('added');
        document.dispatchEvent(new CustomEvent(EVENT.CART_UPDATED, { detail: { payload } }));

        setTimeout(() => {
          if (label) label.textContent = previous || text('add_to_cart');
        }, 2000);
      } catch (caught) {
        report('buy', 'add', caught);
        if (error) {
          const offline = caught instanceof TypeError || globalThis.navigator?.onLine === false;
          error.textContent = offline
            ? text('error_network')
            : caught instanceof Error && caught.message
              ? caught.message
              : text('error_generic');
          error.hidden = false;
        }
        if (label) label.textContent = previous || text('add_to_cart');
      } finally {
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
          delete button.dataset.neLoading;
        }
      }
    });
  }
}

function applyRenderedSections(sections) {
  if (!sections || typeof sections !== 'object') return;
  for (const [id, html] of Object.entries(sections)) {
    if (typeof html !== 'string') continue;
    const target = document.getElementById(`shopify-section-${id}`);
    if (!target) continue;
    try {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const incoming = parsed.getElementById(`shopify-section-${id}`) ?? parsed.body.firstElementChild;
      if (incoming) target.innerHTML = incoming.innerHTML;
    } catch (error) {
      report('sections', id, error);
    }
  }
}

enhanceBuyForms();

document.addEventListener('shopify:section:load', (event) => {
  const target = event?.target;
  if (target instanceof Element) enhanceBuyForms(target);
});
