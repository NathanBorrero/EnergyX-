/* generado desde src/lib/variant-matrix.js — no editar, ver scripts/sync-theme-assets.mjs */
import { foldKey, isPurchasable } from 'ne/semantics';

export const VALUE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  NONEXISTENT: 'nonexistent',
});

const KEY_SEPARATOR = '\u0000';

function selectionKey(optionNames, selection) {
  return optionNames
    .map((name) => foldKey(selection[name]))
    .join(KEY_SEPARATOR);
}

export function createVariantMatrix(variants, rawOpts = {}) {
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

  const canonicalName = new Map(optionNames.map((n) => [foldKey(n), n]));

  function resolveOptionName(name) {
    return canonicalName.get(foldKey(name));
  }

  function canonicalizeSelection(selection) {
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

  const valuesByOption = new Map(optionNames.map((name) => [name, []]));
  const seenValues = new Map(optionNames.map((name) => [name, new Set()]));

  const byCombination = new Map();

  for (const variant of usable) {
    const selection = {};
    for (const opt of variant.selectedOptions) {
      if (!opt || typeof opt.name !== 'string') continue;
      selection[opt.name] = opt.value;
    }

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
    const existing = byCombination.get(key);
    if (!existing || (!isPurchasable(existing) && isPurchasable(variant))) {
      byCombination.set(key, variant);
    }
  }

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

  const api = {
    optionNames: Object.freeze([...optionNames]),

    options: Object.freeze(
      optionNames.map((name) =>
        Object.freeze({ name, values: Object.freeze([...valuesByOption.get(name)]) }),
      ),
    ),

    variantCount: byCombination.size,

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

    statusesFor(optionName, selection = {}) {
      const canon = resolveOptionName(optionName);
      const values = canon === undefined ? [] : (valuesByOption.get(canon) ?? []);
      return values.map((value) => ({
        value,
        status: api.statusFor(optionName, value, selection),
      }));
    },

    resolve(rawSelection) {
      if (optionNames.length === 0) return null;
      const selection = canonicalizeSelection(rawSelection);
      const complete = optionNames.every((name) => selection[name] !== undefined);
      if (!complete) return null;
      return byCombination.get(selectionKey(optionNames, selection)) ?? null;
    },

    firstAvailableSelection() {
      for (const variant of byCombination.values()) {
        if (!isPurchasable(variant)) continue;
        const selection = {};
        for (const opt of variant.selectedOptions) selection[opt.name] = opt.value;
        return selection;
      }
      return null;
    },

    reconcile(rawSelection, changedOption) {
      const selection = canonicalizeSelection(rawSelection);
      const changed = changedOption === undefined ? undefined : resolveOptionName(changedOption);
      const next = { ...selection };
      if (matching(next).length > 0) return next;

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

    purchasableValuesFor(optionName, selection = {}) {
      return api
        .statusesFor(optionName, selection)
        .filter((entry) => entry.status === VALUE_STATUS.AVAILABLE)
        .map((entry) => entry.value);
    },
  };

  return api;
}

