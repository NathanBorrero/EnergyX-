/**
 * Contrato canónico de producto.
 *
 * POR QUÉ EXISTE
 * --------------
 * Los módulos nacieron con formas de entrada distintas para lo mismo:
 * `variant-matrix` esperaba `selectedOptions: [{name, value}]` y
 * `product-jsonld` esperaba `options: { Color: 'Negro' }`. Dos formas para el
 * mismo dato significan dos traducciones desde Shopify, y dos traducciones
 * divergen — exactamente el defecto que la auditoría ya encontró un nivel más
 * abajo, con la normalización de nombres.
 *
 * Esto define UNA forma. Los módulos la consumen; `shopify-adapter.js` la
 * produce. Nada más la construye a mano.
 *
 * DISEÑO: CERCA DE SHOPIFY, NO DE UNA ABSTRACCIÓN
 * ----------------------------------------------
 * La forma imita deliberadamente lo que devuelve Shopify (`selectedOptions`,
 * `availableForSale`, `options[].values`) para que el adaptador sea fino y
 * auditable. No es un modelo de dominio: es el mínimo común que los cinco
 * módulos necesitan.
 *
 * Esto NO es una capa de datos. No hay caché, ni red, ni estado. Son tipos y una
 * validación que devuelve problemas en lugar de lanzarlos.
 */

import { foldKey } from './shopify-semantics.js';

/**
 * @typedef {object} ProductImage
 * @property {string} url
 * @property {string} [altText]
 */

/**
 * @typedef {object} ProductOption
 * @property {string} name   Nombre tal como lo devuelve Shopify. Ej. 'Talla'.
 * @property {string[]} values  Valores en el orden de Shopify.
 */

/**
 * @typedef {object} ProductVariant
 * @property {string} id
 * @property {{name: string, value: string}[]} selectedOptions
 * @property {string} [sku]
 * @property {string} [title]
 * @property {string} [price]   Decimal como cadena. Nunca un número con coma.
 * @property {boolean} [availableForSale]  Ausente significa "no se sabe".
 * @property {ProductImage} [image]
 */

/**
 * @typedef {object} ProductMetafields
 * @property {{label: string, footLengthCm: number}[]} [sizeChart]
 * @property {{name?: string, advice?: string, sizeOffset?: number, widthNote?: string}} [fitProfile]
 * @property {string} [upperMaterial]
 * @property {string} [soleMaterial]
 * @property {string} [care]
 */

/**
 * @typedef {object} Product
 * @property {string} title              Lo único imprescindible.
 * @property {string} [id]
 * @property {string} [handle]
 * @property {string} [url]
 * @property {string} [description]
 * @property {string} [brand]            `vendor` en Shopify.
 * @property {string} [currency]         ISO 4217.
 * @property {ProductImage[]} [images]
 * @property {ProductOption[]} [options]
 * @property {ProductVariant[]} [variants]
 * @property {ProductMetafields} [metafields]
 * @property {string} [productGroupID]   "parent sku" para datos estructurados.
 */

/** Número máximo de opciones que admite Shopify. Verificado en vivo y por prueba negativa. */
export const MAX_PRODUCT_OPTIONS = 3;

/** Número máximo de variantes por producto. Verificado en vivo. */
export const MAX_PRODUCT_VARIANTS = 2048;

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid   false solo si falta algo sin lo cual no se puede trabajar.
 * @property {string[]} errors  Impiden usar el producto.
 * @property {string[]} warnings  No impiden, pero delatan un catálogo mal cargado.
 */

/**
 * Valida un producto canónico.
 *
 * No lanza nunca y no corrige nada: informa. Quien llama decide si renderiza
 * degradado o no renderiza (§216).
 *
 * Las advertencias existen porque un catálogo de footwear mal cargado falla de
 * formas silenciosas: una variante sin todas las opciones no es seleccionable,
 * un valor declarado en `options` que ninguna variante usa aparece en el selector
 * y no lleva a ninguna parte.
 *
 * @param {Product} product
 * @returns {ValidationResult}
 */
export function validateProduct(product) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];

  if (!product || typeof product !== 'object') {
    return { valid: false, errors: ['El producto no es un objeto.'], warnings };
  }

  if (typeof product.title !== 'string' || product.title.trim() === '') {
    errors.push('Falta `title`, que es lo único imprescindible.');
  }

  const options = Array.isArray(product.options) ? product.options : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];

  if (options.length > MAX_PRODUCT_OPTIONS) {
    errors.push(
      `${options.length} opciones: Shopify admite ${MAX_PRODUCT_OPTIONS} como máximo ` +
        '(verificado por prueba negativa: OPTIONS_OVER_LIMIT).',
    );
  }
  if (variants.length > MAX_PRODUCT_VARIANTS) {
    errors.push(`${variants.length} variantes: el máximo por producto es ${MAX_PRODUCT_VARIANTS}.`);
  }

  const optionNames = options.map((o) => o?.name).filter((n) => typeof n === 'string');
  const foldedOptionNames = new Set(optionNames.map(foldKey));

  if (foldedOptionNames.size !== optionNames.length) {
    errors.push('Hay nombres de opción duplicados tras normalizar.');
  }

  if (variants.length === 0) {
    warnings.push('Sin variantes: no hay nada que seleccionar ni comprar.');
  }

  // Coherencia entre las opciones declaradas y las que usan las variantes.
  /** @type {Map<string, Set<string>>} */
  const usedValues = new Map(optionNames.map((n) => [foldKey(n), new Set()]));
  let incomplete = 0;
  let withoutPrice = 0;
  let withoutAvailability = 0;

  for (const variant of variants) {
    if (!variant || !Array.isArray(variant.selectedOptions)) {
      warnings.push('Una variante no tiene `selectedOptions` y se ignorará.');
      continue;
    }
    const got = new Set(
      variant.selectedOptions.map((o) => foldKey(o?.name)).filter((n) => n !== ''),
    );
    if (optionNames.length > 0 && optionNames.some((n) => !got.has(foldKey(n)))) incomplete += 1;

    for (const opt of variant.selectedOptions) {
      const bucket = usedValues.get(foldKey(opt?.name));
      if (bucket && typeof opt?.value === 'string') bucket.add(foldKey(opt.value));
    }

    if (typeof variant.price !== 'string' && typeof variant.price !== 'number') withoutPrice += 1;
    if (typeof variant.availableForSale !== 'boolean') withoutAvailability += 1;
  }

  if (incomplete > 0) {
    errors.push(
      `${incomplete} variante(s) no cubren todas las opciones del producto. ` +
        'No serán seleccionables.',
    );
  }
  if (withoutPrice > 0) {
    warnings.push(`${withoutPrice} variante(s) sin precio: no se emitirá su oferta.`);
  }
  if (withoutAvailability > 0) {
    warnings.push(
      `${withoutAvailability} variante(s) sin \`availableForSale\`: se tratarán como no ` +
        'comprables y no se declarará su disponibilidad.',
    );
  }

  for (const option of options) {
    if (!option || typeof option.name !== 'string') continue;
    const declared = Array.isArray(option.values) ? option.values : [];
    const used = usedValues.get(foldKey(option.name)) ?? new Set();
    const orphans = declared.filter((v) => typeof v === 'string' && !used.has(foldKey(v)));
    if (orphans.length > 0) {
      warnings.push(
        `La opción "${option.name}" declara ${orphans.join(', ')} pero ninguna variante los usa. ` +
          'Aparecerían en el selector sin llevar a ninguna parte.',
      );
    }
  }

  if (product.currency !== undefined && !/^[A-Za-z]{3}$/.test(String(product.currency).trim())) {
    warnings.push('`currency` no tiene forma ISO 4217; las ofertas no se emitirán.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Producto canónico vacío pero válido en forma, con el título como placeholder
 * explícito. Sirve para montar la página antes de que exista catálogo, sin que
 * nada finja ser un dato real (§191).
 *
 * @param {string} [label]
 * @returns {Product}
 */
export function placeholderProduct(label = 'PLACEHOLDER — producto pendiente de definir') {
  return {
    title: label,
    description: 'PLACEHOLDER. Sin copy, sin claims, sin especificaciones.',
    images: [],
    options: [],
    variants: [],
    metafields: {},
  };
}
