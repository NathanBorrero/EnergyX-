/* generado desde src/lib/cart-line.js — no editar, ver scripts/sync-theme-assets.mjs */
import { VALUE_STATUS } from 'ne/variant-matrix';

export const MAX_LINE_ATTRIBUTES = 250;

const MAX_ATTRIBUTE_LENGTH = 200;

export const REJECTION = Object.freeze({
  NO_MATRIX: 'no_matrix',
  INCOMPLETE_SELECTION: 'incomplete_selection',
  NONEXISTENT: 'nonexistent_combination',
  OUT_OF_STOCK: 'out_of_stock',
  NO_VARIANT_ID: 'missing_variant_id',
  INVALID_QUANTITY: 'invalid_quantity',
});

function str(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > MAX_ATTRIBUTE_LENGTH ? trimmed.slice(0, MAX_ATTRIBUTE_LENGTH) : trimmed;
}

export function normalizeAttributes(source) {
  const out = [];
  const seen = new Set();

  function push(rawKey, rawValue) {
    const key = str(rawKey);
    if (key === undefined || seen.has(key)) return;
    const value =
      typeof rawValue === 'number' && Number.isFinite(rawValue)
        ? String(rawValue)
        : typeof rawValue === 'boolean'
          ? String(rawValue)
          : str(rawValue);
    if (value === undefined) return;
    seen.add(key);
    out.push({ key, value });
  }

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (entry && typeof entry === 'object') push(entry.key, entry.value);
    }
  } else if (source && typeof source === 'object') {
    for (const key of Object.keys(source)) push(key, source[key]);
  }

  return out.slice(0, MAX_LINE_ATTRIBUTES);
}

export function buildCartLine(args) {
  const { matrix, selection, quantity = 1, attributes } = args ?? {};

  if (!matrix || typeof matrix.resolve !== 'function' || !Array.isArray(matrix.optionNames)) {
    return { ok: false, reason: REJECTION.NO_MATRIX };
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: REJECTION.INVALID_QUANTITY };
  }

  const missing = matrix.optionNames.filter((name) => {
    const provided = selection && typeof selection === 'object'
      ? Object.keys(selection).find((k) => k.toLowerCase() === name.toLowerCase())
      : undefined;
    return provided === undefined || selection[provided] === undefined || selection[provided] === null;
  });
  if (missing.length > 0) {
    return { ok: false, reason: REJECTION.INCOMPLETE_SELECTION, missing };
  }

  const variant = matrix.resolve(selection);
  if (!variant) {
    return { ok: false, reason: REJECTION.NONEXISTENT, status: VALUE_STATUS.NONEXISTENT };
  }

  if (variant.availableForSale !== true) {
    return { ok: false, reason: REJECTION.OUT_OF_STOCK, status: VALUE_STATUS.UNAVAILABLE };
  }

  const merchandiseId = str(variant.id);
  if (merchandiseId === undefined) {
    return { ok: false, reason: REJECTION.NO_VARIANT_ID };
  }

  const line = { merchandiseId, quantity };
  const normalized = normalizeAttributes(attributes);
  if (normalized.length > 0) line.attributes = normalized;

  return { ok: true, line, status: VALUE_STATUS.AVAILABLE };
}

export function sizeFitAttributes(rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const out = {};
  const chosen = str(args.chosenSize);
  const recommended = str(args.recommendedSize);

  if (chosen !== undefined) out._ne_size_chosen = chosen;
  if (recommended !== undefined) out._ne_size_recommended = recommended;

  if (chosen !== undefined && recommended !== undefined) {
    out._ne_size_followed = String(chosen.toLowerCase() === recommended.toLowerCase());
  }

  if (typeof args.footLengthCm === 'number' && Number.isFinite(args.footLengthCm) && args.footLengthCm > 0) {
    out._ne_foot_length_cm = String(Math.round(args.footLengthCm * 10) / 10);
  }
  if (typeof args.usedSizeGuide === 'boolean') {
    out._ne_size_guide_used = String(args.usedSizeGuide);
  }

  return out;
}
