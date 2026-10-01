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

import { foldKey, isPurchasable, hasAvailabilityData } from './shopify-semantics.js';

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
});

/**
 * `ancho` / `horma` NO están en el mapa por defecto, a propósito.
 *
 * schema.org no tiene una propiedad propia para el ancho de calzado, y mapearlo
 * a `size` lo hace colisionar con la talla. La auditoría midió el resultado: con
 * `{ Talla: '42', Ancho: 'D' }` se emitía `size: "D"` — el ancho sobrescribía la
 * talla y se publicaba un dato estructurado falso.
 *
 * Omitir es honesto; sobrescribir no lo es. Si más adelante se decide modelar el
 * ancho, se pasa un `optionMap` explícito y la detección de colisiones de abajo
 * impide que se pierda la talla en silencio.
 *
 * Contexto de la decisión: docs/THIRD-OPTION-ANALYSIS.md
 */

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
    // Decimal simple, sin notación científica, sin signo, y sin ceros a la
    // izquierda. `"00042"` pasaba el filtro anterior y se emitía tal cual, que es
    // un precio malformado en el grafo. Auditoría de seguridad S6.
    if (/^(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) return trimmed;
  }
  return undefined;
}

/**
 * Forma de un código ISO 4217: exactamente tres letras.
 *
 * No se valida contra la lista real de monedas —eso cambia y no se puede
 * verificar aquí—, solo la forma. Una moneda malformada hace que no se emita la
 * oferta: mejor sin oferta que con una moneda inventada. Auditoría S7.
 *
 * @param {unknown} currency
 * @returns {string|undefined}
 */
function normalizeCurrency(currency) {
  if (!hasText(currency)) return undefined;
  const trimmed = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Nombres de propiedad que nunca se escriben en un nodo del grafo.
 *
 * `optionMap` lo aporta quien integra el módulo, no un visitante, así que esto no
 * es una barrera contra un atacante: es una barrera contra un error. Un
 * `property: 'constructor'` emitía `"constructor": "X"` en el JSON-LD, que no es
 * vocabulario de schema.org y ensucia el grafo. Auditoría S3 y S4.
 */
const FORBIDDEN_PROPERTIES = Object.freeze(
  new Set(['__proto__', 'constructor', 'prototype', '@type', '@context', '@id']),
);

/**
 * @param {unknown} name
 * @returns {boolean} true si se puede escribir como propiedad del grafo.
 */
function isSafeProperty(name) {
  return (
    typeof name === 'string' &&
    /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) &&
    !FORBIDDEN_PROPERTIES.has(name)
  );
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
  const priceCurrency = normalizeCurrency(currency);
  if (price === undefined || priceCurrency === undefined) return undefined;

  /** @type {Record<string, unknown>} */
  const offer = {
    '@type': 'Offer',
    price,
    priceCurrency,
  };

  // availableForSale es la fuente de verdad de Shopify. Si no viene, no se
  // declara disponibilidad: inventarla sería declarar stock falso.
  // La definición de "comprable" vive en shopify-semantics.js, una sola vez.
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

/**
 * Entrada: el producto canónico de `product-contract.js`, más un mapa de opciones
 * opcional. No define su propia forma: ese era el defecto que esto corrige.
 *
 * @typedef {import('./product-contract.js').Product & {
 *   optionMap?: Record<string, {variesBy: string, property: string}>
 * }} JsonLdProductInput
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
  if (!input || !hasText(input.title)) return null;

  const optionMap = { ...DEFAULT_OPTION_MAP, ...(input.optionMap ?? {}) };

  /** @type {Record<string, unknown>} */
  const node = {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: input.title.trim(),
  };

  setIfPresent(node, 'description', input.description);
  setIfPresent(node, 'url', input.url);
  // Las imágenes del contrato son objetos `{url, altText}`; schema.org quiere URLs.
  setIfPresent(
    node,
    'image',
    Array.isArray(input.images)
      ? input.images.map((i) => (typeof i === 'string' ? i : i?.url)).filter(hasText)
      : undefined,
  );
  setIfPresent(node, 'productGroupID', input.productGroupID);

  // brand solo si viene. No se deduce del nombre de la tienda.
  if (hasText(input.brand)) {
    node.brand = { '@type': 'Brand', name: input.brand.trim() };
  }

  const variants = Array.isArray(input.variants) ? input.variants : [];
  const variesBySet = new Set();
  const hasVariant = [];
  /** Opciones omitidas por colisión de propiedad. Se exponen, no se ocultan. */
  const collisions = new Set();
  /** Opciones omitidas por nombre de propiedad no admisible. */
  const rejected = new Set();

  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;

    /** @type {Record<string, unknown>} */
    const v = { '@type': 'Product' };

    // `selectedOptions` es la forma canónica, la misma que consume variant-matrix.
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

    // Nombre de la variante: el del grupo más sus opciones. Es composición de
    // datos existentes, no invención.
    const suffix = optionNames
      .map((k) => options[k])
      .filter(hasText)
      .join(' / ');
    v.name = suffix ? `${node.name} — ${suffix}` : node.name;

    // Precedencia por orden de opción: la primera que reclama una propiedad de
    // schema.org se la queda. Una segunda que reclamara la misma se omite, en
    // lugar de sobrescribirla. Omitir un dato es honesto; falsear otro no.
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

    // Una variante sin ninguna seña distintiva no aporta nada al grafo.
    const meaningful =
      v.offers !== undefined ||
      v.sku !== undefined ||
      optionNames.some((k) => optionMap[foldKey(k)] && hasText(options[k]));
    if (meaningful) hasVariant.push(v);
  }

  if (variesBySet.size > 0) node.variesBy = [...variesBySet];
  if (hasVariant.length > 0) node.hasVariant = hasVariant;

  // Las colisiones no se emiten en el JSON-LD (no son vocabulario de schema.org),
  // pero tampoco se esconden: viajan en una propiedad no enumerable para que un
  // chequeo de QA o el consumidor puedan detectarlas sin ensuciar la salida.
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

/**
 * Opciones que se omitieron por colisionar con una propiedad ya reclamada.
 *
 * Devuelve lista vacía si no hubo ninguna. Sirve para que un chequeo previo a
 * publicar avise de que un eje de variación no se está expresando, en lugar de
 * descubrirlo por un dato raro en el buscador.
 *
 * @param {Record<string, unknown>|null} node
 * @returns {readonly string[]}
 */
export function collisionsIn(node) {
  if (!node) return [];
  const value = /** @type {{__collisions?: readonly string[]}} */ (node).__collisions;
  return Array.isArray(value) ? value : [];
}

/**
 * Opciones omitidas porque su propiedad de destino no era admisible.
 * @param {Record<string, unknown>|null} node
 * @returns {readonly string[]}
 */
export function rejectedIn(node) {
  if (!node) return [];
  const value = /** @type {{__rejected?: readonly string[]}} */ (node).__rejected;
  return Array.isArray(value) ? value : [];
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
  return (
    JSON.stringify(node)
      // Cierre de etiqueta: impide romper el documento o inyectar marcado.
      .replace(/</g, '\\u003c')
      // Separadores de línea Unicode: válidos en JSON pero rompen un contexto
      // JavaScript. Defensa en profundidad por si la cadena acaba inlineada en
      // un script en lugar de en un bloque ld+json. Auditoría S2.
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
  );
}
