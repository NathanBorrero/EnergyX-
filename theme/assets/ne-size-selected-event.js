/* generado desde src/lib/size-selected-event.js — no editar, ver scripts/sync-theme-assets.mjs */
import { foldKey } from 'ne/semantics';
import { VALUE_STATUS } from 'ne/variant-matrix';

export const SIZE_SELECTED_EVENT = 'ne:size_selected';

const MAX_FIELD_LENGTH = 120;

function field(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > MAX_FIELD_LENGTH ? trimmed.slice(0, MAX_FIELD_LENGTH) : trimmed;
}

export function resolveShopifyPublish() {
  const g = /** @type {any} */ (globalThis);
  const fn = g?.Shopify?.analytics?.publish;
  return typeof fn === 'function' ? fn.bind(g.Shopify.analytics) : null;
}

export function createSizeSelectionTracker(rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const sizeOptionName = field(options.sizeOptionName) ?? 'Talla';
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const publish =
    options.publish === undefined ? resolveShopifyPublish() : options.publish;

  let lastSize = null;
  let lastProduct = null;
  let published = 0;
  let suppressed = 0;

  function track({ size, status, context = {} } = /** @type {any} */ ({})) {
    const value = field(size);
    if (value === undefined) {
      return { published: false, reason: 'size_missing' };
    }

    const productKey = field(context.productId) ?? field(context.productHandle) ?? '';
    const sizeKey = foldKey(value);

    if (sizeKey === lastSize && productKey === lastProduct) {
      suppressed += 1;
      return { published: false, reason: 'duplicate' };
    }

    if (typeof publish !== 'function') {
      lastSize = sizeKey;
      lastProduct = productKey;
      return { published: false, reason: 'no_publisher' };
    }

    const payload = {
      option_name: sizeOptionName,
      size: value,
      selected_at: new Date(now()).toISOString(),
    };

    const validStatus = Object.values(VALUE_STATUS).includes(status) ? status : undefined;
    if (validStatus !== undefined) payload.status = validStatus;

    for (const [key, source] of [
      ['product_id', context.productId],
      ['product_handle', context.productHandle],
      ['variant_id', context.variantId],
      ['source', context.source],
    ]) {
      const clean = field(source);
      if (clean !== undefined) payload[key] = clean;
    }

    let delivered = false;
    try {
      publish(SIZE_SELECTED_EVENT, payload);
      delivered = true;
    } catch {
      delivered = false;
    }

    lastSize = sizeKey;
    lastProduct = productKey;
    if (delivered) published += 1;

    return delivered
      ? { published: true, reason: 'published', payload }
      : { published: false, reason: 'publish_failed', payload };
  }

  function reset() {
    lastSize = null;
    lastProduct = null;
  }

  function stats() {
    return { published, suppressed };
  }

  return { track, reset, stats, eventName: SIZE_SELECTED_EVENT };
}
