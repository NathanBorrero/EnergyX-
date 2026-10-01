/**
 * Semántica compartida de Shopify.
 *
 * POR QUÉ EXISTE
 * --------------
 * Una auditoría cruzada de los módulos encontró la misma semántica codificada en
 * dos sitios, con dos implementaciones distintas:
 *
 *  1. `variant-matrix` normalizaba los VALORES de opción pero comparaba los
 *     NOMBRES de forma exacta, mientras `product-jsonld` sí plegaba los nombres.
 *     Consecuencia real medida: pasar `{ talla: '42' }` en lugar de
 *     `{ Talla: '42' }` devolvía `nonexistent` — el peor fallo posible, porque
 *     parece que la combinación no existe en vez de parecer un error.
 *
 *  2. La traducción de `availableForSale` a "se puede comprar" estaba en dos
 *     módulos. Dos copias de una regla divergen tarde o temprano.
 *
 * Este archivo tiene exactamente dos funciones. No es una capa de abstracción:
 * es el sitio donde vive una definición que debe ser única.
 */

/**
 * Normalización canónica de nombres y valores de opción.
 *
 * Quita acentos, recorta y baja a minúsculas. Se usa **solo para comparar**;
 * el valor original se conserva siempre para mostrar.
 *
 * Tolerante a propósito: Shopify devuelve el nombre canónico ("Color", "Talla"),
 * pero un theme puede pasar otra caja. Fallar en silencio ahí es peor que casar.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function foldKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Única definición de "esta variante se puede comprar".
 *
 * Deliberadamente estricta: solo `true` cuenta. `undefined` significa que no
 * sabemos, y no saber no es poder comprar. Afirmar disponibilidad sin dato
 * sería inventar stock (§191, §210).
 *
 * @param {{availableForSale?: unknown}|null|undefined} variant
 * @returns {boolean}
 */
export function isPurchasable(variant) {
  return Boolean(variant) && variant.availableForSale === true;
}

/**
 * Distingue "no se puede comprar" de "no se sabe".
 * `product-jsonld` lo necesita: sin dato, no declara disponibilidad.
 *
 * @param {{availableForSale?: unknown}|null|undefined} variant
 * @returns {boolean}
 */
export function hasAvailabilityData(variant) {
  return Boolean(variant) && typeof variant.availableForSale === 'boolean';
}
