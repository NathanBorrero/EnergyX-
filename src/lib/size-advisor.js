/**
 * Recomendación de talla a partir de la medida real del pie.
 *
 * POR QUÉ EXISTE
 * --------------
 * En calzado la talla equivocada es la causa principal de devolución, y con pago
 * contra entrega el comprador no ha pagado nada, así que rechazar el paquete no
 * le cuesta. El coste del RTO se lo come el margen.
 *
 * Pedir un número de talla es pedirle al comprador que adivine. Pedirle que mida
 * su pie en centímetros es un dato objetivo. Esta es la palanca de margen más
 * barata que tiene la página, y es pura aritmética: no necesita servicio
 * externo, ni modelo, ni base de datos.
 *
 * QUÉ NO HACE
 * -----------
 * No contiene ninguna tabla de tallas. Los datos de equivalencia y de longitud
 * tienen que venir del fabricante o de medición física del producto, y entran
 * como argumento. Inventarlos provocaría exactamente el RTO que se intenta
 * evitar (§191: no suposición).
 *
 * En Shopify esos datos viven en un metaobject `size_chart`; ver
 * shopify/footwear-data-model.graphql.
 *
 * Sin dependencias. Pura. Sobrevive a la decisión de arquitectura pendiente.
 */

/**
 * @typedef {object} SizeRow
 * @property {string} label Talla como se le muestra al comprador. Ej. "42".
 * @property {number} footLengthCm Longitud de pie que esa talla admite, en cm.
 */

/** Grado de confianza de la recomendación. */
export const CONFIDENCE = Object.freeze({
  EXACT: 'exact',       // la medida cae justo en una talla
  ROUNDED: 'rounded',   // cae entre dos tallas
  OUT_OF_RANGE: 'out_of_range', // fuera de lo que cubre la tabla
  NO_DATA: 'no_data',   // sin tabla utilizable
});

/**
 * Política por defecto cuando la medida cae entre dos tallas: subir.
 *
 * Es una DECISIÓN DE DISEÑO, no un dato verificado. El razonamiento: un zapato
 * ligeramente holgado se puede usar —con plantilla o calcetín más grueso—
 * mientras que uno pequeño no se puede usar en absoluto. Ante la duda, el error
 * recuperable es preferible al irrecuperable.
 *
 * Es configurable porque una horma concreta puede justificar lo contrario, y esa
 * información es del fabricante.
 */
const DEFAULT_ROUNDING = 'up';

/** Holgura por defecto, en cm, sobre la longitud del pie. Configurable. */
const DEFAULT_EASE_CM = 0;

/**
 * Tolerancia para comparar centímetros.
 *
 * Es necesaria, no decorativa: las longitudes en cm se escriben con un decimal,
 * pero en coma flotante `25.9 - 25.2` da 0.6999999999999957 y `26.6 - 25.9` da
 * 0.7000000000000028. Sin tolerancia, dos distancias que deberían empatar no lo
 * hacen, y el desempate nunca se aplica. Detectado por las pruebas.
 *
 * 1e-6 cm es seis órdenes de magnitud por debajo de cualquier precisión útil al
 * medir un pie.
 */
const EPSILON_CM = 1e-6;

/**
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
function nearlyEqual(a, b) {
  return Math.abs(a - b) < EPSILON_CM;
}

/**
 * @param {unknown} n
 * @returns {boolean}
 */
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Limpia y ordena la tabla. Descarta filas inutilizables en lugar de fallar
 * (§216: degradar elegantemente).
 * @param {readonly SizeRow[]} chart
 * @returns {SizeRow[]}
 */
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

/**
 * @typedef {object} Recommendation
 * @property {string|null} label Talla recomendada, o null si no se puede recomendar.
 * @property {string} confidence Uno de CONFIDENCE.
 * @property {string} reason Clave estable para que la interfaz elija el mensaje.
 * @property {SizeRow|null} matched Fila elegida.
 * @property {SizeRow[]} alternatives Tallas colindantes, para ofrecer opción.
 * @property {number|null} slackCm Holgura resultante en cm, si se pudo calcular.
 */

/**
 * Recomienda una talla para una longitud de pie dada.
 *
 * @param {number} footLengthCm Longitud del pie en centímetros.
 * @param {readonly SizeRow[]} chart Tabla de tallas del modelo.
 * @param {object} [opts]
 * @param {'up'|'down'|'nearest'} [opts.rounding] Qué hacer entre dos tallas.
 * @param {number} [opts.easeCm] Holgura a añadir a la medida antes de buscar.
 * @returns {Recommendation}
 */
export function recommendSize(footLengthCm, chart, opts = {}) {
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

  // Fuera de rango: se dice, no se fuerza una talla que no sirve.
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

  // Entre dos tallas.
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

/**
 * Tallas colindantes de una fila.
 * @param {SizeRow[]} rows
 * @param {SizeRow} row
 * @returns {SizeRow[]}
 */
function neighbours(rows, row) {
  const i = rows.findIndex((r) => r.label === row.label);
  return [rows[i - 1], rows[i + 1]].filter(Boolean);
}

/**
 * @param {number} n
 * @returns {number}
 */
function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Intersecta la recomendación con lo que de verdad se puede comprar.
 *
 * Recomendar una talla agotada es peor que no recomendar: el comprador se ilusiona
 * y luego no puede comprar. Esta función degrada a la talla comprable más cercana
 * y lo dice.
 *
 * @param {Recommendation} recommendation
 * @param {readonly string[]} purchasableLabels Tallas comprables ahora mismo.
 * @param {readonly SizeRow[]} chart
 * @returns {Recommendation & { substituted: boolean }}
 */
export function reconcileWithStock(recommendation, purchasableLabels, chart) {
  const buyable = new Set(
    (Array.isArray(purchasableLabels) ? purchasableLabels : []).map((l) => String(l).trim()),
  );

  if (recommendation.label && buyable.has(recommendation.label)) {
    return { ...recommendation, substituted: false };
  }

  const rows = usableRows(chart).filter((r) => buyable.has(r.label));
  if (rows.length === 0 || !recommendation.matched) {
    return { ...recommendation, substituted: false, reason: recommendation.label ? 'recommended_out_of_stock' : recommendation.reason };
  }

  // La comprable cuya longitud se desvía menos, prefiriendo subir en caso de empate.
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
