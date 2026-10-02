/* GENERADO por scripts/sync-theme-assets.mjs desde src/lib/variant-matrix.js.
   NO EDITAR AQUÍ: el cambio se perdería en la siguiente sincronización y la
   comprobación `assets del theme sincronizados` fallaría. Edita el módulo
   original, que es el que tiene pruebas. */
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

import { foldKey, isPurchasable } from 'ne/semantics';

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
 * @param {readonly string[]} optionNames
 * @param {Record<string, string>} selection
 * @returns {string}
 */
function selectionKey(optionNames, selection) {
  return optionNames
    .map((name) => foldKey(selection[name]))
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
export function createVariantMatrix(variants, rawOpts = {}) {
  // Un parámetro por defecto solo cubre `undefined`, no `null`. Normalizado
  // explícitamente: §216 exige degradar, no lanzar.
  const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
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

  /** Nombre plegado -> nombre canónico, para aceptar cualquier caja desde fuera. */
  const canonicalName = new Map(optionNames.map((n) => [foldKey(n), n]));

  /**
   * Resuelve el nombre canónico de una opción, tolerando caja y acentos.
   * @param {string} name
   * @returns {string|undefined}
   */
  function resolveOptionName(name) {
    return canonicalName.get(foldKey(name));
  }

  /**
   * Reescribe una selección a nombres canónicos. Sin esto, `{ talla: '42' }`
   * devolvía `nonexistent`, que es indistinguible de "no existe".
   * @param {Record<string, string>|null|undefined} selection
   * @returns {Record<string, string>}
   */
  function canonicalizeSelection(selection) {
    /** @type {Record<string, string>} */
    const out = {};
    if (!selection || typeof selection !== 'object') return out;
    for (const key of Object.keys(selection)) {
      const canon = resolveOptionName(key);
      if (canon !== undefined && selection[key] !== undefined && selection[key] !== null) {
        out[canon] = selection[key];
      }
    }
    return out;
  }

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
      const norm = foldKey(raw);
      if (!seen.has(norm)) {
        seen.add(norm);
        valuesByOption.get(name).push(raw);
      }
    }

    const key = selectionKey(optionNames, selection);
    // Si dos variantes comparten combinación, gana la comprable.
    const existing = byCombination.get(key);
    if (!existing || (!isPurchasable(existing) && isPurchasable(variant))) {
      byCombination.set(key, variant);
    }
  }

  /**
   * Variantes que encajan con una selección parcial.
   * @param {Record<string, string>} selection
   * @returns {Variant[]}
   */
  function matching(rawSelection) {
    const selection = canonicalizeSelection(rawSelection);
    const constraints = optionNames
      .filter((name) => selection[name] !== undefined && selection[name] !== null)
      .map((name) => [foldKey(name), foldKey(selection[name])]);

    const result = [];
    for (const variant of byCombination.values()) {
      const got = Object.create(null);
      for (const opt of variant.selectedOptions) got[foldKey(opt.name)] = foldKey(opt.value);
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
      const canon = resolveOptionName(optionName);
      if (canon === undefined) return VALUE_STATUS.NONEXISTENT;

      const probe = { ...canonicalizeSelection(selection), [canon]: value };
      const candidates = matching(probe);

      if (candidates.length === 0) return VALUE_STATUS.NONEXISTENT;
      return candidates.some(isPurchasable)
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
      const canon = resolveOptionName(optionName);
      const values = canon === undefined ? [] : (valuesByOption.get(canon) ?? []);
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
    resolve(rawSelection) {
      if (optionNames.length === 0) return null;
      const selection = canonicalizeSelection(rawSelection);
      const complete = optionNames.every((name) => selection[name] !== undefined);
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
        if (!isPurchasable(variant)) continue;
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
    reconcile(rawSelection, changedOption) {
      const selection = canonicalizeSelection(rawSelection);
      const changed = changedOption === undefined ? undefined : resolveOptionName(changedOption);
      const next = { ...selection };
      if (matching(next).length > 0) return next;

      // Suelta opciones, de la última a la primera, sin tocar la que cambió.
      for (let i = optionNames.length - 1; i >= 0; i -= 1) {
        const name = optionNames[i];
        if (name === changed) continue;
        if (next[name] === undefined) continue;
        delete next[name];
        if (matching(next).length > 0) return next;
      }
      return changed !== undefined && selection[changed] !== undefined
        ? { [changed]: selection[changed] }
        : {};
    },

    /**
     * Valores de una opción que se pueden comprar ahora mismo.
     *
     * Existe para cerrar una costura que estaba implícita: `size-advisor`
     * necesita saber qué tallas son comprables, y antes había que construir esa
     * lista a mano desde fuera, con el riesgo de que cada consumidor la
     * calculara distinto.
     *
     * @param {string} optionName
     * @param {Record<string, string>} [selection]
     * @returns {string[]} Valores tal como se muestran, no plegados.
     */
    purchasableValuesFor(optionName, selection = {}) {
      return api
        .statusesFor(optionName, selection)
        .filter((entry) => entry.status === VALUE_STATUS.AVAILABLE)
        .map((entry) => entry.value);
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
 * @property {(optionName: string, selection?: Record<string,string>) => string[]} purchasableValuesFor
 */
