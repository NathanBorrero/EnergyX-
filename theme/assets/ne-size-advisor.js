/* generado desde src/lib/size-advisor.js — no editar, ver scripts/sync-theme-assets.mjs */
import { foldKey } from 'ne/semantics';

export const CONFIDENCE = Object.freeze({
  EXACT: 'exact',       // la medida cae justo en una talla
  ROUNDED: 'rounded',   // cae entre dos tallas
  OUT_OF_RANGE: 'out_of_range', // fuera de lo que cubre la tabla
  NO_DATA: 'no_data',   // sin tabla utilizable
});

const DEFAULT_ROUNDING = 'up';

const DEFAULT_EASE_CM = 0;

const EPSILON_CM = 1e-6;

function nearlyEqual(a, b) {
  return Math.abs(a - b) < EPSILON_CM;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function usableRows(chart) {
  if (!Array.isArray(chart)) return [];
  return chart
    .filter(
      (row) =>
        row &&
        typeof row.label === 'string' &&
        row.label.trim() !== '' &&
        isFiniteNumber(row.footLengthCm) &&
        row.footLengthCm > 0,
    )
    .map((row) => ({ label: row.label.trim(), footLengthCm: row.footLengthCm }))
    .sort((a, b) => a.footLengthCm - b.footLengthCm);
}

export function recommendSize(footLengthCm, chart, rawOpts = {}) {
  const opts = rawOpts && typeof rawOpts === 'object' ? rawOpts : {};
  const rows = usableRows(chart);
  const rounding = opts.rounding ?? DEFAULT_ROUNDING;
  const easeCm = isFiniteNumber(opts.easeCm) ? opts.easeCm : DEFAULT_EASE_CM;

  if (rows.length === 0) {
    return {
      label: null,
      confidence: CONFIDENCE.NO_DATA,
      reason: 'chart_empty',
      matched: null,
      alternatives: [],
      slackCm: null,
    };
  }

  if (!isFiniteNumber(footLengthCm) || footLengthCm <= 0) {
    return {
      label: null,
      confidence: CONFIDENCE.NO_DATA,
      reason: 'measurement_invalid',
      matched: null,
      alternatives: [],
      slackCm: null,
    };
  }

  const target = footLengthCm + easeCm;
  const smallest = rows[0];
  const largest = rows[rows.length - 1];

  if (target < smallest.footLengthCm - EPSILON_CM) {
    return {
      label: null,
      confidence: CONFIDENCE.OUT_OF_RANGE,
      reason: 'below_smallest',
      matched: null,
      alternatives: [smallest],
      slackCm: null,
    };
  }
  if (target > largest.footLengthCm + EPSILON_CM) {
    return {
      label: null,
      confidence: CONFIDENCE.OUT_OF_RANGE,
      reason: 'above_largest',
      matched: null,
      alternatives: [largest],
      slackCm: null,
    };
  }

  const exact = rows.find((r) => nearlyEqual(r.footLengthCm, target));
  if (exact) {
    return {
      label: exact.label,
      confidence: CONFIDENCE.EXACT,
      reason: 'exact_match',
      matched: exact,
      alternatives: neighbours(rows, exact),
      slackCm: round1(exact.footLengthCm - footLengthCm),
    };
  }

  let lowerIdx = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].footLengthCm < target - EPSILON_CM) lowerIdx = i;
    else break;
  }
  const lower = rows[lowerIdx];
  const upper = rows[lowerIdx + 1] ?? largest;

  let chosen;
  if (rounding === 'down') chosen = lower;
  else if (rounding === 'nearest') {
    const dLower = Math.abs(target - lower.footLengthCm);
    const dUpper = Math.abs(upper.footLengthCm - target);
    chosen = dLower < dUpper + EPSILON_CM ? lower : upper;
  } else chosen = upper;

  return {
    label: chosen.label,
    confidence: CONFIDENCE.ROUNDED,
    reason: rounding === 'down' ? 'rounded_down' : rounding === 'nearest' ? 'rounded_nearest' : 'rounded_up',
    matched: chosen,
    alternatives: [lower, upper].filter((r) => r.label !== chosen.label),
    slackCm: round1(chosen.footLengthCm - footLengthCm),
  };
}

function neighbours(rows, row) {
  const i = rows.findIndex((r) => r.label === row.label);
  return [rows[i - 1], rows[i + 1]].filter(Boolean);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function reconcileWithStock(rawRecommendation, purchasableLabels, chart) {
  const recommendation =
    rawRecommendation && typeof rawRecommendation === 'object'
      ? rawRecommendation
      : { label: null, confidence: CONFIDENCE.NO_DATA, reason: 'recommendation_missing', matched: null, alternatives: [], slackCm: null };
  const buyable = new Set(
    (Array.isArray(purchasableLabels) ? purchasableLabels : []).map(foldKey),
  );

  if (recommendation.label && buyable.has(foldKey(recommendation.label))) {
    return { ...recommendation, substituted: false };
  }

  const rows = usableRows(chart).filter((r) => buyable.has(foldKey(r.label)));
  if (rows.length === 0 || !recommendation.matched) {
    return { ...recommendation, substituted: false, reason: recommendation.label ? 'recommended_out_of_stock' : recommendation.reason };
  }

  const targetCm = recommendation.matched.footLengthCm;
  let best = rows[0];
  for (const row of rows) {
    const d = Math.abs(row.footLengthCm - targetCm);
    const bd = Math.abs(best.footLengthCm - targetCm);
    const tied = nearlyEqual(d, bd);
    if ((d < bd && !tied) || (tied && row.footLengthCm > best.footLengthCm)) best = row;
  }

  return {
    ...recommendation,
    label: best.label,
    matched: best,
    confidence: CONFIDENCE.ROUNDED,
    reason: 'substituted_for_stock',
    alternatives: [],
    slackCm: null,
    substituted: true,
  };
}
