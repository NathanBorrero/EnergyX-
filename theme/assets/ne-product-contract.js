/* generado desde src/lib/product-contract.js — no editar, ver scripts/sync-theme-assets.mjs */
import { foldKey } from 'ne/semantics';

export const MAX_PRODUCT_OPTIONS = 3;

export const MAX_PRODUCT_VARIANTS = 2048;

export function validateProduct(product) {
 const errors = [];
 const warnings = [];

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
