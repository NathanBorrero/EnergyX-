/* generado desde src/lib/shopify-semantics.js — no editar, ver scripts/sync-theme-assets.mjs */
function safeString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return String(value);
  } catch {
    return '';
  }
}

export function foldKey(value) {
  return safeString(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function isPurchasable(variant) {
  return Boolean(variant) && variant.availableForSale === true;
}

export function hasAvailabilityData(variant) {
  return Boolean(variant) && typeof variant.availableForSale === 'boolean';
}
