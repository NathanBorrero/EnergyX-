/**
 * Motor de disponibilidad de combinaciones para la página de producto.
 *
 * POR QUÉ EXISTE
 * --------------
 * Shopify expone `optionValues[].hasVariants`, que indica si un VALOR de opción
 * lo usa alguna variante del producto — NO si una combinación concreta
 * (Color × Talla) existe. Verificado por ejecución: un producto con un color
 * disponible solo en 2 de 4 tallas devuelve `hasVariants: true` para las cuatro.
 * Evidencia: docs/VERIFICATION-LOG.md §4.
 *
 * Un selector que se fíe de ese campo ofrece tallas inexistentes. En footwear,
 * donde la matriz talla × color casi nunca está completa, eso ocurre en casi
 * todos los productos.
 *
 * Este módulo calcula la disponibilidad desde las variantes reales y distingue
 * TRES estados, no dos:
 *
 *   available    → la combinación existe y se puede comprar
 *   unavailable  → la combinación existe pero está agotada
 *   nonexistent  → la combinación no existe en el catálogo
 *
 * Esa distinción importa para la interfaz: "agotado en tu talla" y "no fabricamos
 * esta talla en este color" son mensajes distintos, y mezclarlos hace que la
 * página parezca rota.
 *
 * Sin dependencias. Funciona igual dentro de un theme Liquid que en React, así
 * que sobrevive a la decisión de arquitectura pendiente.
 */

/** @typedef {{ name: string, value: string }} SelectedOption */
/**
 * @typedef {object} Variant
 * @property {string} id
 * @property {SelectedOption[]} selectedOptions
 * @property {boolean} [availableForSale]
 */

/** Estados posibles de un valor de opción dada una selección parcial. */
export const VALUE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  NONEXISTENT: 'nonexistent',
});

const KEY_SEPARATOR = '\u0000';

/**
 * Normaliza un valor de opción para comparar sin sorpresas por espacios o caja.
 * No se usa para mostrar: solo como clave interna.
 * @param {unknown} value
 * @returns {string}
 */
function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * @param {readonly string[]} optionNames
 * @param {Record<string, string>} selection
 * @returns {string}
 */
function selectionKey(optionNames, selection) {
  return optionNames
    .map((name) => normalize(selection[name]))
    .join(KEY_SEPARATOR);
}

/**
 * Construye el índice de combinaciones de un producto.
 *
 * Tolera entrada defectuosa a propósito (§216: degradar, no explotar). Una
 * variante sin `selectedOptions` se ignora en lugar de romper la página.
 *
 * @param {readonly Variant[]} variants Variantes tal como las devuelve Shopify.
 * @param {object} [opts]
 * @param {readonly string[]} [opts.optionNames]
 *   Orden de las opciones. Si se omite, se deduce del orden de aparición en la
 *   primera variante, que es el orden de `position` que devuelve Shopify.
 * @returns {VariantMatrix}
 */
export function createVariantMatrix(variants, opts = {}) {
  const list = Array.isArray(variants) ? variants : [];

  const usable = list.filter(
    (v) => v && Array.isArray(v.selectedOptions) && v.selectedOptions.length > 0,
  );

  const optionNames =
    opts.optionNames && opts.optionNames.length > 0
      ? [...opts.optionNames]
      : usable.length > 0
        ? usable[0].selectedOptions.map((o) => o.name)
        : [];

  /** Valores por opción, en orden de aparición y sin duplicados. */
  const valuesByOption = new Map(optionNames.map((name) => [name, []]));
  const seenValues = new Map(optionNames.map((name) => [name, new Set()]));

  /** clave completa de combinación -> variante */
  const byCombination = new Map();

  for (const variant of usable) {
    /** @type {Record<string, string>} */
    const selection = {};
    for (const opt of variant.selectedOptions) {
      if (!opt || typeof opt.name !== 'string') continue;
      selection[opt.name] = opt.value;
    }

    // Una variante que no cubre todas las opciones conocidas no es indexable.
    const coversAll = optionNames.every((name) => selection[name] !== undefined);
    if (!coversAll) continue;

    for (const name of optionNames) {
      const raw = selection[name];
      const seen = seenValues.get(name);
      const norm = normalize(raw);
      if (!seen.has(norm)) {
        seen.add(norm);
        valuesByOption.get(name).push(raw);
      }
    }

    const key = selectionKey(optionNames, selection);
    // Si dos variantes comparten combinación, gana la comprable.
    const existing = byCombination.get(key);
    if (!existing || (!existing.availableForSale && variant.availableForSale)) {
      byCombination.set(key, variant);
    }
  }

  /**
   * Variantes que encajan con una selección parcial.
   * @param {Record<string, string>} selection
   * @returns {Variant[]}
   */
  function matching(selection) {
    const constraints = optionNames
      .filter((name) => selection?.[name] !== undefined && selection[name] !== null)
      .map((name) => [name, normalize(selection[name])]);

    const result = [];
    for (const variant of byCombination.values()) {
      const got = Object.create(null);
      for (const opt of variant.selectedOptions) got[opt.name] = normalize(opt.value);
      if (constraints.every(([name, want]) => got[name] === want)) result.push(variant);
    }
    return result;
  }

  /** @type {VariantMatrix} */
  const api = {
    optionNames: Object.freeze([...optionNames]),

    options: Object.freeze(
      optionNames.map((name) =>
        Object.freeze({ name, values: Object.freeze([...valuesByOption.get(name)]) }),
      ),
    ),

    variantCount: byCombination.size,

    /**
     * Estado de un valor de opción, dada la selección actual del resto.
     *
     * El valor que se está evaluando sustituye al de su propia opción: así, al
     * mirar las tallas, no se filtra por la talla ya elegida.
     *
     * @param {string} optionName
     * @param {string} value
     * @param {Record<string, string>} [selection]
     * @returns {'available'|'unavailable'|'nonexistent'}
     */
    statusFor(optionName, value, selection = {}) {
      if (!optionNames.includes(optionName)) return VALUE_STATUS.NONEXISTENT;

      const probe = { ...selection, [optionName]: value };
      const candidates = matching(probe);

      if (candidates.length === 0) return VALUE_STATUS.NONEXISTENT;
      return candidates.some((v) => v.availableForSale === true)
        ? VALUE_STATUS.AVAILABLE
        : VALUE_STATUS.UNAVAILABLE;
    },

    /**
     * Estado de todos los valores de una opción en una sola pasada.
     * Es lo que consume el selector para pintarse.
     * @param {string} optionName
     * @param {Record<string, string>} [selection]
     * @returns {{ value: string, status: 'available'|'unavailable'|'nonexistent' }[]}
     */
    statusesFor(optionName, selection = {}) {
      const values = valuesByOption.get(optionName) ?? [];
      return values.map((value) => ({
        value,
        status: api.statusFor(optionName, value, selection),
      }));
    },

    /**
     * Variante exacta de una selección completa.
     * @param {Record<string, string>} selection
     * @returns {Variant|null}
     */
    resolve(selection) {
      if (optionNames.length === 0) return null;
      const complete = optionNames.every(
        (name) => selection?.[name] !== undefined && selection[name] !== null,
      );
      if (!complete) return null;
      return byCombination.get(selectionKey(optionNames, selection)) ?? null;
    },

    /**
     * Primera selección completa que se puede comprar. Sirve para elegir el
     * estado inicial de la página sin aterrizar en una variante agotada.
     * @returns {Record<string, string>|null}
     */
    firstAvailableSelection() {
      for (const variant of byCombination.values()) {
        if (variant.availableForSale !== true) continue;
        /** @type {Record<string, string>} */
        const selection = {};
        for (const opt of variant.selectedOptions) selection[opt.name] = opt.value;
        return selection;
      }
      return null;
    },

    /**
     * Ajusta una selección para que apunte a algo que existe, conservando todo
     * lo que se pueda de la elección del usuario.
     *
     * Caso real: el comprador tiene la talla 40 elegida y cambia a un color que
     * no se fabrica en 40. En lugar de dejar la página en un estado imposible,
     * se mantiene el color nuevo y se suelta la talla.
     *
     * @param {Record<string, string>} selection
     * @param {string} [changedOption] Opción que el usuario acaba de tocar; nunca se suelta.
     * @returns {Record<string, string>}
     */
    reconcile(selection, changedOption) {
      const next = {};
      for (const name of optionNames) {
        if (selection?.[name] !== undefined && selection[name] !== null) {
          next[name] = selection[name];
        }
      }
      if (matching(next).length > 0) return next;

      // Suelta opciones, de la última a la primera, sin tocar la que cambió.
      for (let i = optionNames.length - 1; i >= 0; i -= 1) {
        const name = optionNames[i];
        if (name === changedOption) continue;
        if (next[name] === undefined) continue;
        delete next[name];
        if (matching(next).length > 0) return next;
      }
      return changedOption && selection?.[changedOption] !== undefined
        ? { [changedOption]: selection[changedOption] }
        : {};
    },
  };

  return api;
}

/**
 * @typedef {object} VariantMatrix
 * @property {readonly string[]} optionNames
 * @property {readonly {name: string, values: readonly string[]}[]} options
 * @property {number} variantCount
 * @property {(optionName: string, value: string, selection?: Record<string,string>) => 'available'|'unavailable'|'nonexistent'} statusFor
 * @property {(optionName: string, selection?: Record<string,string>) => {value: string, status: string}[]} statusesFor
 * @property {(selection: Record<string,string>) => Variant|null} resolve
 * @property {() => Record<string,string>|null} firstAvailableSelection
 * @property {(selection: Record<string,string>, changedOption?: string) => Record<string,string>} reconcile
 */
