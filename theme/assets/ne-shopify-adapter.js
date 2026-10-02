/* generado desde src/lib/shopify-adapter.js — no editar, ver scripts/sync-theme-assets.mjs */
function nodesOf(connection) {
  if (!connection || typeof connection !== 'object') return [];
  const c = /** @type {{nodes?: unknown, edges?: unknown}} */ (connection);
  if (Array.isArray(c.nodes)) return c.nodes;
  if (Array.isArray(c.edges)) {
    return c.edges
      .map((e) => (e && typeof e === 'object' ? /** @type {{node?: unknown}} */ (e).node : null))
      .filter((n) => n !== null && n !== undefined);
  }
  return [];
}

function listOf(value) {
  return Array.isArray(value) ? value : nodesOf(value);
}

function normalizeMoney(price) {
  if (typeof price === 'string' && price.trim() !== '') {
    return { price: price.trim(), currency: undefined };
  }
  if (typeof price === 'number' && Number.isFinite(price)) {
    return { price: String(price), currency: undefined };
  }
  if (price && typeof price === 'object') {
    const m = /** @type {{amount?: unknown, currencyCode?: unknown}} */ (price);
    const amount =
      typeof m.amount === 'string' && m.amount.trim() !== ''
        ? m.amount.trim()
        : typeof m.amount === 'number' && Number.isFinite(m.amount)
          ? String(m.amount)
          : undefined;
    const currency = typeof m.currencyCode === 'string' ? m.currencyCode.trim() : undefined;
    return { price: amount, currency };
  }
  return { price: undefined, currency: undefined };
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function normalizeImage(source) {
  if (!source || typeof source !== 'object') return undefined;
  const s = /** @type {Record<string, any>} */ (source);
  const direct = text(s.url);
  if (direct) {
    const alt = text(s.altText);
    return alt ? { url: direct, altText: alt } : { url: direct };
  }
  const nested = s.preview?.image;
  if (nested) return normalizeImage(nested);
  if (s.image) return normalizeImage(s.image);
  return undefined;
}

export function fromShopifyProduct(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const title = text(raw.title);
  if (!title) return null;

  const handle = text(raw.handle);
  const urlBase = text(opts.urlBase);

  const product = { title };

  const id = text(raw.id);
  if (id) product.id = id;
  if (handle) product.handle = handle;

  const url = text(raw.onlineStoreUrl) ?? (urlBase && handle ? `${urlBase.replace(/\/+$/, '')}/products/${handle}` : undefined);
  if (url) product.url = url;

  const description = text(raw.description) ?? text(raw.descriptionHtml);
  if (description) product.description = description;

  const brand = text(raw.vendor);
  if (brand) product.brand = brand;

  const rawOptions = listOf(raw.options);
  const options = [];
  for (const option of rawOptions) {
    if (!option || typeof option !== 'object') continue;
    const name = text(/** @type {any} */ (option).name);
    if (!name) continue;
    const o = /** @type {Record<string, any>} */ (option);
    const values = listOf(o.optionValues)
      .map((v) => (v && typeof v === 'object' ? text(/** @type {any} */ (v).name) : text(v)))
      .filter((v) => v !== undefined);
    const legacy = Array.isArray(o.values) ? o.values.map(text).filter((v) => v !== undefined) : [];
    options.push({ name, values: values.length > 0 ? values : legacy });
  }
  if (options.length > 0) product.options = options;

  const rawVariants = listOf(raw.variants);
  const variants = [];
  let detectedCurrency;

  for (const variant of rawVariants) {
    if (!variant || typeof variant !== 'object') continue;
    const v = /** @type {Record<string, any>} */ (variant);

    const selectedOptions = (Array.isArray(v.selectedOptions) ? v.selectedOptions : [])
      .map((o) => {
        if (!o || typeof o !== 'object') return null;
        const name = text(/** @type {any} */ (o).name);
        const value = text(/** @type {any} */ (o).value);
        return name && value ? { name, value } : null;
      })
      .filter((o) => o !== null);

    const out = { id: text(v.id) ?? '', selectedOptions };

    const sku = text(v.sku);
    if (sku) out.sku = sku;
    const vtitle = text(v.title);
    if (vtitle) out.title = vtitle;

    const { price, currency } = normalizeMoney(v.price);
    if (price !== undefined) out.price = price;
    if (currency !== undefined && detectedCurrency === undefined) detectedCurrency = currency;

    if (typeof v.availableForSale === 'boolean') out.availableForSale = v.availableForSale;

    const image = normalizeImage(v.image ?? v.featuredImage ?? v.featuredMedia);
    if (image) out.image = image;

    variants.push(out);
  }
  if (variants.length > 0) product.variants = variants;

  const images = [];
  for (const source of [...listOf(raw.images), ...listOf(raw.media)]) {
    const image = normalizeImage(source);
    if (image && !images.some((i) => i.url === image.url)) images.push(image);
  }
  const featured = normalizeImage(raw.featuredMedia ?? raw.featuredImage);
  if (featured && !images.some((i) => i.url === featured.url)) images.unshift(featured);
  if (images.length > 0) product.images = images;

  const rangeCurrency = text(raw.priceRangeV2?.minVariantPrice?.currencyCode)
    ?? text(raw.priceRange?.minVariantPrice?.currencyCode);
  const currency = detectedCurrency ?? text(opts.currency) ?? rangeCurrency;
  if (currency) product.currency = currency;

  return product;
}

export function fromSizeChartMetaobjects(entries) {
  const list = listOf(entries);
  const rows = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = /** @type {Record<string, any>} */ (entry);

    const fields = {};
    if (Array.isArray(e.fields)) {
      for (const f of e.fields) {
        if (f && typeof f === 'object') {
          const key = text(/** @type {any} */ (f).key);
          const value = /** @type {any} */ (f).value;
          if (key && typeof value === 'string') fields[key] = value;
        }
      }
    }

    const label = text(fields.label) ?? text(e.label);
    const rawLength = fields.foot_length_cm ?? e.footLengthCm ?? e.foot_length_cm;
    const footLengthCm =
      typeof rawLength === 'number'
        ? rawLength
        : typeof rawLength === 'string' && rawLength.trim() !== ''
          ? Number(rawLength)
          : NaN;

    if (!label || !Number.isFinite(footLengthCm) || footLengthCm <= 0) continue;
    rows.push({ label, footLengthCm });
  }

  return rows.sort((a, b) => a.footLengthCm - b.footLengthCm);
}
