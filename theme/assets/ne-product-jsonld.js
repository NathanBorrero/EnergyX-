/* generado desde src/lib/product-jsonld.js — no editar, ver scripts/sync-theme-assets.mjs */
import { foldKey, isPurchasable, hasAvailabilityData } from 'ne/semantics';

export const VARIES_BY = Object.freeze({
  COLOR: 'https://schema.org/color',
  SIZE: 'https://schema.org/size',
  MATERIAL: 'https://schema.org/material',
  PATTERN: 'https://schema.org/pattern',
  SUGGESTED_AGE: 'https://schema.org/suggestedAge',
  SUGGESTED_GENDER: 'https://schema.org/suggestedGender',
});

export const AVAILABILITY = Object.freeze({
  IN_STOCK: 'https://schema.org/InStock',
  OUT_OF_STOCK: 'https://schema.org/OutOfStock',
});

const DEFAULT_OPTION_MAP = Object.freeze({
  color: { variesBy: VARIES_BY.COLOR, property: 'color' },
  talla: { variesBy: VARIES_BY.SIZE, property: 'size' },
  size: { variesBy: VARIES_BY.SIZE, property: 'size' },
  material: { variesBy: VARIES_BY.MATERIAL, property: 'material' },
});

function hasText(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function fold(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function setIfPresent(target, key, value) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' && value.trim() === '') return;
  if (Array.isArray(value) && value.length === 0) return;
  target[key] = value;
}

function normalizePrice(price) {
  if (typeof price === 'number' && Number.isFinite(price) && price >= 0) {
    return String(price);
  }
  if (hasText(price)) {
    const trimmed = price.trim();
    if (/^(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) return trimmed;
  }
  return undefined;
}

function normalizeCurrency(currency) {
  if (!hasText(currency)) return undefined;
  const trimmed = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : undefined;
}

const FORBIDDEN_PROPERTIES = Object.freeze(
  new Set(['__proto__', 'constructor', 'prototype', '@type', '@context', '@id']),
);

function isSafeProperty(name) {
  return (
    typeof name === 'string' &&
    /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) &&
    !FORBIDDEN_PROPERTIES.has(name)
  );
}

function buildOffer(variant, currency, url) {
  const price = normalizePrice(variant.price);
  const priceCurrency = normalizeCurrency(currency);
  if (price === undefined || priceCurrency === undefined) return undefined;

  const offer = {
    '@type': 'Offer',
    price,
    priceCurrency,
  };

  if (hasAvailabilityData(variant)) {
    offer.availability = isPurchasable(variant)
      ? AVAILABILITY.IN_STOCK
      : AVAILABILITY.OUT_OF_STOCK;
  }

  setIfPresent(offer, 'url', url);
  setIfPresent(offer, 'itemCondition', variant.itemCondition);
  setIfPresent(offer, 'priceValidUntil', variant.priceValidUntil);
  return offer;
}

export function buildProductGroupJsonLd(input) {
  if (!input || !hasText(input.title)) return null;

  const optionMap = { ...DEFAULT_OPTION_MAP, ...(input.optionMap ?? {}) };

  const node = {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: input.title.trim(),
  };

  setIfPresent(node, 'description', input.description);
  setIfPresent(node, 'url', input.url);
  setIfPresent(
    node,
    'image',
    Array.isArray(input.images)
      ? input.images.map((i) => (typeof i === 'string' ? i : i?.url)).filter(hasText)
      : undefined,
  );
  setIfPresent(node, 'productGroupID', input.productGroupID);

  if (hasText(input.brand)) {
    node.brand = { '@type': 'Brand', name: input.brand.trim() };
  }

  const variants = Array.isArray(input.variants) ? input.variants : [];
  const variesBySet = new Set();
  const hasVariant = [];
  const collisions = new Set();
  const rejected = new Set();

  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;

    const v = { '@type': 'Product' };

    const selected = Array.isArray(variant.selectedOptions) ? variant.selectedOptions : [];
    const options = /** @type {Record<string, string>} */ ({});
    const optionNames = [];
    for (const entry of selected) {
      if (!entry || typeof entry !== 'object') continue;
      const name = entry.name;
      if (typeof name !== 'string' || name.trim() === '') continue;
      options[name] = entry.value;
      optionNames.push(name);
    }

    const suffix = optionNames
      .map((k) => options[k])
      .filter(hasText)
      .join(' / ');
    v.name = suffix ? `${node.name} — ${suffix}` : node.name;

    const claimed = new Set();
    for (const optionName of optionNames) {
      const mapped = optionMap[foldKey(optionName)];
      const value = options[optionName];
      if (!mapped || !hasText(value)) continue;
      if (!isSafeProperty(mapped.property)) {
        rejected.add(`${optionName} -> ${String(mapped.property)}`);
        continue;
      }
      if (claimed.has(mapped.property)) {
        collisions.add(`${optionName} -> ${mapped.property}`);
        continue;
      }
      claimed.add(mapped.property);
      v[mapped.property] = String(value).trim();
      variesBySet.add(mapped.variesBy);
    }

    setIfPresent(v, 'sku', variant.sku);
    setIfPresent(v, 'gtin', variant.gtin);
    setIfPresent(
      v,
      'image',
      typeof variant.image === 'string' ? variant.image : variant.image?.url,
    );

    const offer = buildOffer(variant, input.currency, input.url);
    if (offer) v.offers = offer;

    const meaningful =
      v.offers !== undefined ||
      v.sku !== undefined ||
      optionNames.some((k) => optionMap[foldKey(k)] && hasText(options[k]));
    if (meaningful) hasVariant.push(v);
  }

  if (variesBySet.size > 0) node.variesBy = [...variesBySet];
  if (hasVariant.length > 0) node.hasVariant = hasVariant;

  if (collisions.size > 0) {
    Object.defineProperty(node, '__collisions', {
      value: Object.freeze([...collisions]),
      enumerable: false,
    });
  }
  if (rejected.size > 0) {
    Object.defineProperty(node, '__rejected', {
      value: Object.freeze([...rejected]),
      enumerable: false,
    });
  }

  return node;
}

export function collisionsIn(node) {
  if (!node) return [];
  const value = /** @type {{__collisions?: readonly string[]}} */ (node).__collisions;
  return Array.isArray(value) ? value : [];
}

export function rejectedIn(node) {
  if (!node) return [];
  const value = /** @type {{__rejected?: readonly string[]}} */ (node).__rejected;
  return Array.isArray(value) ? value : [];
}

export function serializeJsonLd(node) {
  if (!node || typeof node !== 'object') return '';

  let json;
  try {
    json = JSON.stringify(node);
  } catch {
    return '';
  }
  if (typeof json !== 'string') return '';

  return (
    json
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
  );
}
