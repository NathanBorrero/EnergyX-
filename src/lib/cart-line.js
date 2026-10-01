/**
 * Construcción validada de una línea de carrito.
 *
 * POR QUÉ EXISTE
 * --------------
 * Entre "el comprador eligió talla" y "hay algo en el carrito" hay una puerta que
 * nadie suele poner: comprobar que la combinación **existe y se puede comprar**
 * antes de intentar añadirla. Sin esa puerta, un selector con un fallo manda al
 * carrito una variante inexistente y el error aparece como un `userErrors` de
 * Shopify que el comprador lee como "algo se rompió".
 *
 * Este módulo es esa puerta, y usa la misma fuente de verdad que el selector
 * (`variant-matrix`), así que no puede discrepar de lo que la interfaz mostró.
 *
 * FORMA DE SALIDA VERIFICADA
 * --------------------------
 * `CartLineInput` de la Storefront API: `merchandiseId` (obligatorio),
 * `quantity` (por defecto 1), `attributes` (máximo 250 valores).
 * Hay más campos (`sellingPlanId`, `parent`) que este proyecto no usa: no hay
 * suscripciones ni bundles, así que no se emiten.
 *
 * LAS ATRIBUCIONES SON LA PIEZA INTERESANTE
 * -----------------------------------------
 * Las atribuciones de línea **persisten al pedido**. Eso las convierte en un
 * canal de datos **autoritativo**, al contrario que un evento de analítica de
 * cliente: lo que se escriba aquí se puede leer después junto al pedido real y
 * junto a si ese pedido se entregó o se devolvió.
 *
 * Para este proyecto eso importa mucho: guardar qué talla recomendó el sistema
 * frente a qué talla eligió el comprador permite medir si el desajuste de talla
 * explica el RTO. Esa correlación no se puede obtener de un pixel.
 *
 * No se escribe nada sensible: son datos que el comprador puede ver.
 *
 * Sin dependencias. Pura. No hace red: devuelve el input, no lo envía.
 */

import { VALUE_STATUS } from './variant-matrix.js';

/** Límite de atribuciones por línea, verificado en la documentación de `CartLineInput`. */
export const MAX_LINE_ATTRIBUTES = 250;

/** Longitud máxima que se emite para una clave o un valor de atribución. */
const MAX_ATTRIBUTE_LENGTH = 200;

/** Motivos por los que una línea no se puede construir. */
export const REJECTION = Object.freeze({
  NO_MATRIX: 'no_matrix',
  INCOMPLETE_SELECTION: 'incomplete_selection',
  NONEXISTENT: 'nonexistent_combination',
  OUT_OF_STOCK: 'out_of_stock',
  NO_VARIANT_ID: 'missing_variant_id',
  INVALID_QUANTITY: 'invalid_quantity',
});

/**
 * @param {unknown} value
 * @returns {string|undefined}
 */
function str(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > MAX_ATTRIBUTE_LENGTH ? trimmed.slice(0, MAX_ATTRIBUTE_LENGTH) : trimmed;
}

/**
 * Normaliza atribuciones a la forma `[{key, value}]` que espera `AttributeInput`.
 *
 * Descarta lo que no sea convertible a texto en lugar de emitir `"undefined"` o
 * `"[object Object]"`, que es lo que acaba viéndose en un pedido real cuando
 * nadie lo filtra. Recorta al límite de la plataforma.
 *
 * @param {Record<string, unknown>|Array<{key: string, value: unknown}>|null|undefined} source
 * @returns {{key: string, value: string}[]}
 */
export function normalizeAttributes(source) {
  /** @type {{key: string, value: string}[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /** @param {unknown} rawKey @param {unknown} rawValue */
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

/**
 * @typedef {object} CartLineResult
 * @property {boolean} ok
 * @property {{merchandiseId: string, quantity: number, attributes?: {key: string, value: string}[]}} [line]
 * @property {string} [reason]   Uno de REJECTION.
 * @property {string} [status]   Estado de la combinación, cuando aplica.
 * @property {string[]} [missing] Opciones que faltan por elegir.
 */

/**
 * Construye una línea de carrito, o explica por qué no se puede.
 *
 * No lanza nunca. Un fallo aquí tiene que producir un mensaje para el comprador,
 * no una excepción (§216).
 *
 * @param {object} args
 * @param {import('./variant-matrix.js').VariantMatrix} args.matrix
 * @param {Record<string, string>} args.selection
 * @param {number} [args.quantity]
 * @param {Record<string, unknown>|Array<{key: string, value: unknown}>} [args.attributes]
 * @returns {CartLineResult}
 */
export function buildCartLine(args) {
  const { matrix, selection, quantity = 1, attributes } = args ?? {};

  if (!matrix || typeof matrix.resolve !== 'function' || !Array.isArray(matrix.optionNames)) {
    return { ok: false, reason: REJECTION.NO_MATRIX };
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: REJECTION.INVALID_QUANTITY };
  }

  // Qué falta por elegir. Se informa para que la interfaz señale el selector
  // correcto en lugar de dar un error genérico.
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

  // La compra se decide por `availableForSale`, nunca por una cuenta de stock
  // calculada en el cliente (§210).
  if (variant.availableForSale !== true) {
    return { ok: false, reason: REJECTION.OUT_OF_STOCK, status: VALUE_STATUS.UNAVAILABLE };
  }

  const merchandiseId = str(variant.id);
  if (merchandiseId === undefined) {
    return { ok: false, reason: REJECTION.NO_VARIANT_ID };
  }

  /** @type {{merchandiseId: string, quantity: number, attributes?: {key: string, value: string}[]}} */
  const line = { merchandiseId, quantity };
  const normalized = normalizeAttributes(attributes);
  if (normalized.length > 0) line.attributes = normalized;

  return { ok: true, line, status: VALUE_STATUS.AVAILABLE };
}

/**
 * Atribuciones de ajuste de talla, para poder medir después si el desajuste
 * explica las devoluciones.
 *
 * Se escriben en la línea porque **persisten al pedido**, así que se pueden
 * cruzar con si ese pedido se entregó o se devolvió. Un evento de analítica de
 * cliente no permite ese cruce, y además es manipulable.
 *
 * Omite todo lo que no exista: sin medida del comprador no se inventa ninguna.
 *
 * @param {object} args
 * @param {string} [args.chosenSize]        Talla que eligió el comprador.
 * @param {string} [args.recommendedSize]   Talla que recomendó el sistema.
 * @param {number} [args.footLengthCm]      Medida que introdujo el comprador.
 * @param {boolean} [args.usedSizeGuide]    Si abrió la guía de tallas.
 * @returns {Record<string, string>}
 */
export function sizeFitAttributes(args = {}) {
  /** @type {Record<string, string>} */
  const out = {};
  const chosen = str(args.chosenSize);
  const recommended = str(args.recommendedSize);

  if (chosen !== undefined) out._ne_size_chosen = chosen;
  if (recommended !== undefined) out._ne_size_recommended = recommended;

  // El dato que de verdad interesa: si el comprador se desvió de la recomendación.
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
