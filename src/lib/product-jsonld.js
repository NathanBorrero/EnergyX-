/**
 * Datos estructurados JSON-LD para un producto de footwear.
 *
 * POR QUÉ EXISTE
 * --------------
 * Busqué documentación de Shopify que afirme que genera JSON-LD de producto
 * automáticamente y **no la encontré**. Mientras no exista evidencia de lo
 * contrario, los datos estructurados son responsabilidad del theme o del
 * storefront. No se asume que vengan gratis (§187).
 *
 * MODELO ELEGIDO: ProductGroup + hasVariant
 * -----------------------------------------
 * Un zapato es un ProductGroup cuyas variantes varían por talla y color. Es el
 * modelo que Google introdujo para variantes, y encaja exactamente con la
 * decisión de modelo de datos ya tomada: UN producto por modelo, con opciones
 * Color y Talla (combined listings son solo Plus).
 *
 * NIVEL DE VERIFICACIÓN
 * ---------------------
 * `developers.google.com` y `schema.org` están bloqueados por la política de
 * egress de este entorno, así que los niveles de requisito de Google
 * (obligatorio / recomendado) son `DOCUMENTADO`, no `VERIFICADO`.
 * El vocabulario y la forma sí son los documentados públicamente.
 *
 * → Antes de publicar: pasar la salida por la prueba de resultados enriquecidos
 *   de Google y por el validador de schema.org. Está pendiente, no hecho.
 *
 * REGLA DURA: NO FABRICAR
 * -----------------------
 * Si un dato no existe, la propiedad **no se emite**. Nunca un precio por
 * defecto, ni una marca inventada, ni un SKU, GTIN, material, review o
 * valoración que no venga en la entrada. Un dato inventado en datos
 * estructurados es una declaración falsa ante un buscador (§191, §242).
 */

/** Propiedades por las que Google admite que varíen las variantes. */
export const VARIES_BY = Object.freeze({
  COLOR: 'https://schema.org/color',
  SIZE: 'https://schema.org/size',
  MATERIAL: 'https://schema.org/material',
  PATTERN: 'https://schema.org/pattern',
  SUGGESTED_AGE: 'https://schema.org/suggestedAge',
  SUGGESTED_GENDER: 'https://schema.org/suggestedGender',
});

/** Valores de disponibilidad de schema.org que este módulo emite. */
export const AVAILABILITY = Object.freeze({
  IN_STOCK: 'https://schema.org/InStock',
  OUT_OF_STOCK: 'https://schema.org/OutOfStock',
});

/**
 * Nombre de opción de Shopify -> propiedad de schema.org.
 * Deliberadamente corto: solo lo que footwear necesita y Google admite.
 * Las claves se comparan en minúsculas y sin acentos.
 */
const DEFAULT_OPTION_MAP = Object.freeze({
  color: { variesBy: VARIES_BY.COLOR, property: 'color' },
  talla: { variesBy: VARIES_BY.SIZE, property: 'size' },
  size: { variesBy: VARIES_BY.SIZE, property: 'size' },
  material: { variesBy: VARIES_BY.MATERIAL, property: 'material' },
  ancho: { variesBy: VARIES_BY.SIZE, property: 'size' },
});

/**
 * @param {unknown} v
 * @returns {boolean} true si es una cadena con contenido real.
 */
function hasText(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Quita acentos y baja a minúsculas, para casar nombres de opción.
 * @param {string} s
 * @returns {string}
 */
function fold(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Añade una clave a un objeto solo si el valor es utilizable.
 * Es el corazón de "no fabricar": lo ausente no aparece.
 * @param {Record<string, unknown>} target
 * @param {string} key
 * @param {unknown} value
 */
function setIfPresent(target, key, value) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' && value.trim() === '') return;
  if (Array.isArray(value) && value.length === 0) return;
  target[key] = value;
}

/**
 * Normaliza un precio sin inventarlo.
 * Shopify devuelve cadenas tipo "79999.00". Se acepta número o cadena numérica.
 * Cualquier otra cosa se descarta: mejor sin precio que con un precio falso.
 * @param {unknown} price
 * @returns {string|undefined}
 */
function normalizePrice(price) {
  if (typeof price === 'number' && Number.isFinite(price) && price >= 0) {
    return String(price);
  }
  if (hasText(price)) {
    const trimmed = price.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  }
  return undefined;
}

/**
 * Construye la Offer de una variante. Devuelve undefined si no hay datos
 * suficientes para una oferta honesta (precio y moneda).
 * @param {object} variant
 * @param {string|undefined} currency
 * @param {string|undefined} url
 * @returns {Record<string, unknown>|undefined}
 */
function buildOffer(variant, currency, url) {
  const price = normalizePrice(variant.price);
  if (price === undefined || !hasText(currency)) return undefined;

  /** @type {Record<string, unknown>} */
  const offer = {
    '@type': 'Offer',
    price,
    priceCurrency: currency.trim(),
  };

  // availableForSale es la fuente de verdad de Shopify. Si no viene, no se
  // declara disponibilidad: inventarla sería declarar stock falso.
  if (variant.availableForSale === true) {
    offer.availability = AVAILABILITY.IN_STOCK;
  } else if (variant.availableForSale === false) {
    offer.availability = AVAILABILITY.OUT_OF_STOCK;
  }

  setIfPresent(offer, 'url', url);
  setIfPresent(offer, 'itemCondition', variant.itemCondition);
  setIfPresent(offer, 'priceValidUntil', variant.priceValidUntil);
  return offer;
}

/**
 * @typedef {object} JsonLdVariantInput
 * @property {Record<string, string>} [options] Opciones de la variante: { Color: 'Negro', Talla: '42' }
 * @property {string} [sku]
 * @property {string} [gtin]
 * @property {string|number} [price]
 * @property {boolean} [availableForSale]
 * @property {string} [image]
 * @property {string} [url]
 * @property {string} [itemCondition]
 * @property {string} [priceValidUntil]
 */

/**
 * @typedef {object} JsonLdProductInput
 * @property {string} name Lo único imprescindible.
 * @property {string} [description]
 * @property {string} [url]
 * @property {string[]} [images]
 * @property {string} [brand]
 * @property {string} [productGroupID] "parent sku" del grupo.
 * @property {string} [currency] Código ISO, p. ej. 'COP'.
 * @property {JsonLdVariantInput[]} [variants]
 * @property {Record<string, {variesBy: string, property: string}>} [optionMap]
 */

/**
 * Genera el JSON-LD de un producto de footwear como ProductGroup.
 *
 * Devuelve `null` si falta el nombre, que es lo único sin lo cual no hay nada
 * que declarar. No lanza: una página no debe caerse por los datos estructurados
 * (§215, §216).
 *
 * @param {JsonLdProductInput} input
 * @returns {Record<string, unknown>|null}
 */
export function buildProductGroupJsonLd(input) {
  if (!input || !hasText(input.name)) return null;

  const optionMap = { ...DEFAULT_OPTION_MAP, ...(input.optionMap ?? {}) };

  /** @type {Record<string, unknown>} */
  const node = {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: input.name.trim(),
  };

  setIfPresent(node, 'description', input.description);
  setIfPresent(node, 'url', input.url);
  setIfPresent(
    node,
    'image',
    Array.isArray(input.images) ? input.images.filter(hasText) : undefined,
  );
  setIfPresent(node, 'productGroupID', input.productGroupID);

  // brand solo si viene. No se deduce del nombre de la tienda.
  if (hasText(input.brand)) {
    node.brand = { '@type': 'Brand', name: input.brand.trim() };
  }

  const variants = Array.isArray(input.variants) ? input.variants : [];
  const variesBySet = new Set();
  const hasVariant = [];

  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;

    /** @type {Record<string, unknown>} */
    const v = { '@type': 'Product' };

    const options = variant.options ?? {};
    const optionNames = Object.keys(options);

    // Nombre de la variante: el del grupo más sus opciones. Es composición de
    // datos existentes, no invención.
    const suffix = optionNames
      .map((k) => options[k])
      .filter(hasText)
      .join(' / ');
    v.name = suffix ? `${node.name} — ${suffix}` : node.name;

    for (const optionName of optionNames) {
      const mapped = optionMap[fold(optionName)];
      const value = options[optionName];
      if (!mapped || !hasText(value)) continue;
      v[mapped.property] = String(value).trim();
      variesBySet.add(mapped.variesBy);
    }

    setIfPresent(v, 'sku', variant.sku);
    setIfPresent(v, 'gtin', variant.gtin);
    setIfPresent(v, 'image', variant.image);

    const offer = buildOffer(variant, input.currency, variant.url ?? input.url);
    if (offer) v.offers = offer;

    // Una variante sin ninguna seña distintiva no aporta nada al grafo.
    const meaningful =
      v.offers !== undefined ||
      v.sku !== undefined ||
      optionNames.some((k) => optionMap[fold(k)] && hasText(options[k]));
    if (meaningful) hasVariant.push(v);
  }

  if (variesBySet.size > 0) node.variesBy = [...variesBySet];
  if (hasVariant.length > 0) node.hasVariant = hasVariant;

  return node;
}

/**
 * Serializa el nodo para incrustarlo en un `<script type="application/ld+json">`.
 *
 * Escapa `<` para que un cierre de etiqueta dentro de un dato no pueda romper el
 * documento ni inyectar marcado. Es la defensa mínima contra XSS por datos de
 * producto (§198, §208).
 *
 * @param {Record<string, unknown>|null} node
 * @returns {string} Cadena vacía si no hay nada que emitir.
 */
export function serializeJsonLd(node) {
  if (!node) return '';
  return JSON.stringify(node).replace(/</g, '\\u003c');
}
