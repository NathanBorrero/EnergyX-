/**
 * Adaptador: respuesta de Shopify → producto canónico.
 *
 * POR QUÉ EXISTE
 * --------------
 * Es el único sitio donde se conoce la forma de la respuesta de Shopify. Si
 * Shopify cambia, se cambia aquí y no en cinco módulos. Si hubiera dos
 * traducciones, divergirían: ese defecto ya apareció una vez en este proyecto.
 *
 * DOS APIS, DOS FORMAS — y la diferencia importa
 * ----------------------------------------------
 * | Campo     | Admin API                      | Storefront API                       |
 * | --------- | ------------------------------ | ------------------------------------ |
 * | precio    | `price: "79999.00"`            | `price: { amount, currencyCode }`     |
 * | variantes | `variants { edges { node } }`   | `variants { nodes }`                  |
 * | opciones  | `options { optionValues }`      | `options { optionValues }`           |
 * | imágenes  | `featuredMedia`, `media`       | `images { nodes }`, `media { nodes }` |
 *
 * El precio del Admin API está `VERIFIED`: lo leí de la tienda de pruebas, donde
 * devolvió la cadena `"79999.00"`. La forma `MoneyV2` de la Storefront API está
 * `DOCUMENTED` por la documentación de Hydrogen; no pude ejecutar una consulta de
 * Storefront API sin token de storefront.
 *
 * Por eso el adaptador acepta **las dos formas** y no asume ninguna. Eso no es
 * defensa de más: es la única manera honesta de escribirlo sin haber ejecutado
 * las dos.
 *
 * Sin dependencias, sin red, sin estado. Pura transformación.
 */

/**
 * Desenvuelve una conexión GraphQL, en cualquiera de sus dos formas.
 * @param {unknown} connection
 * @returns {unknown[]}
 */
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

/**
 * Acepta un array directo o una conexión.
 * @param {unknown} value
 * @returns {unknown[]}
 */
function listOf(value) {
  return Array.isArray(value) ? value : nodesOf(value);
}

/**
 * Normaliza el precio desde cualquiera de las dos formas.
 *
 * Devuelve `{ price, currency }` con `undefined` en lo que no venga. No inventa
 * ninguno de los dos: sin precio no habrá oferta, y eso es correcto.
 *
 * @param {unknown} price
 * @returns {{price: string|undefined, currency: string|undefined}}
 */
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

/**
 * @param {unknown} value
 * @returns {string|undefined}
 */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Imagen desde `{url, altText}` o desde `{preview: {image: {url}}}` del Admin API.
 * @param {unknown} source
 * @returns {{url: string, altText?: string}|undefined}
 */
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

/**
 * Convierte una respuesta de producto de Shopify al contrato canónico.
 *
 * Tolera campos ausentes a propósito: una consulta mínima debe producir un
 * producto utilizable, no una excepción (§216).
 *
 * @param {Record<string, any>|null|undefined} raw Nodo `product` de Admin o Storefront API.
 * @param {object} [opts]
 * @param {string} [opts.currency] Moneda de la tienda, si la respuesta no la trae.
 * @param {string} [opts.urlBase] Base para construir la URL del producto desde el handle.
 * @returns {import('./product-contract.js').Product|null} null si no hay ni título.
 */
export function fromShopifyProduct(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const title = text(raw.title);
  if (!title) return null;

  const handle = text(raw.handle);
  const urlBase = text(opts.urlBase);

  /** @type {import('./product-contract.js').Product} */
  const product = { title };

  const id = text(raw.id);
  if (id) product.id = id;
  if (handle) product.handle = handle;

  const url = text(raw.onlineStoreUrl) ?? (urlBase && handle ? `${urlBase.replace(/\/+$/, '')}/products/${handle}` : undefined);
  if (url) product.url = url;

  // `description` en texto plano se prefiere sobre `descriptionHtml` para datos
  // estructurados: schema.org espera texto, no marcado.
  const description = text(raw.description) ?? text(raw.descriptionHtml);
  if (description) product.description = description;

  const brand = text(raw.vendor);
  if (brand) product.brand = brand;

  // Opciones: `optionValues[].name` es la forma vigente; `values[]` la antigua.
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

  // Variantes.
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

    /** @type {import('./product-contract.js').ProductVariant} */
    const out = { id: text(v.id) ?? '', selectedOptions };

    const sku = text(v.sku);
    if (sku) out.sku = sku;
    const vtitle = text(v.title);
    if (vtitle) out.title = vtitle;

    const { price, currency } = normalizeMoney(v.price);
    if (price !== undefined) out.price = price;
    if (currency !== undefined && detectedCurrency === undefined) detectedCurrency = currency;

    // `availableForSale` es la fuente de verdad. Si no viene, se deja ausente:
    // "no se sabe" no es "no se puede comprar", y el resto del sistema ya
    // distingue las dos cosas.
    if (typeof v.availableForSale === 'boolean') out.availableForSale = v.availableForSale;

    const image = normalizeImage(v.image ?? v.featuredImage ?? v.featuredMedia);
    if (image) out.image = image;

    variants.push(out);
  }
  if (variants.length > 0) product.variants = variants;

  // Imágenes del producto: `images`, `media`, o la destacada.
  const images = [];
  for (const source of [...listOf(raw.images), ...listOf(raw.media)]) {
    const image = normalizeImage(source);
    if (image && !images.some((i) => i.url === image.url)) images.push(image);
  }
  const featured = normalizeImage(raw.featuredMedia ?? raw.featuredImage);
  if (featured && !images.some((i) => i.url === featured.url)) images.unshift(featured);
  if (images.length > 0) product.images = images;

  // Moneda: la de la variante, si no la pasada, si no la del rango de precios.
  const rangeCurrency = text(raw.priceRangeV2?.minVariantPrice?.currencyCode)
    ?? text(raw.priceRange?.minVariantPrice?.currencyCode);
  const currency = detectedCurrency ?? text(opts.currency) ?? rangeCurrency;
  if (currency) product.currency = currency;

  return product;
}

/**
 * Convierte entradas de un metaobject `size_chart` a las filas que espera
 * `size-advisor`.
 *
 * Acepta la forma del Admin API (`fields: [{key, value}]`) y una forma ya plana.
 * Los valores llegan como cadenas desde Shopify, así que se convierten; una fila
 * sin longitud utilizable se descarta en lugar de falsear un cero.
 *
 * @param {unknown} entries
 * @returns {{label: string, footLengthCm: number}[]}
 */
export function fromSizeChartMetaobjects(entries) {
  const list = listOf(entries);
  const rows = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = /** @type {Record<string, any>} */ (entry);

    /** @type {Record<string, string>} */
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
