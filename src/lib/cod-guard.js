/**
 * Validación previa al checkout para contra entrega.
 *
 * POR QUÉ ESTO VIVE AQUÍ Y NO EN EL CHECKOUT
 * ------------------------------------------
 * Verificado: las extensiones de UI en los pasos de información, envío y pago del
 * checkout son **exclusivas de Shopify Plus**, y el plan objetivo es Advanced.
 * Por tanto no se pueden añadir campos ni validaciones dentro del checkout.
 *
 * No es una limitación que haya que sortear: define dónde se trabaja. Toda
 * validación ocurre **antes** del `checkoutUrl`, en el storefront, que es donde
 * hay control total de diseño. Y resulta que es exactamente donde se combate el
 * RTO, así que el sitio obligado es también el sitio correcto.
 *
 * QUÉ VALIDA Y QUÉ NO
 * -------------------
 * Valida **forma**, no existencia. Que un teléfono tenga forma de móvil
 * colombiano no significa que exista; que un municipio esté en la lista no
 * significa que la dirección sea real. Para eso hace falta un servicio externo,
 * que no se va a inventar.
 *
 * NO CONTIENE DATOS DE COBERTURA
 * ------------------------------
 * La lista de municipios con contra entrega **se inyecta**. Colombia tiene más de
 * mil municipios y la cobertura depende de la transportadora y del proveedor de
 * fulfillment. Inventar esa lista produciría pedidos que nadie puede entregar, es
 * decir, RTO fabricado por nosotros (§191).
 *
 * NUMERACIÓN COLOMBIANA — `DOCUMENTED`
 * ------------------------------------
 * Desde la renumeración de 2021: todo número nacional tiene **exactamente 10
 * dígitos**, sin prefijo troncal 0. Los **móviles empiezan por 3**; los fijos por
 * **60** más un dígito de región (601 Bogotá, 602 Valle). Código de país +57.
 *
 * Nivel `DOCUMENTED`: fuentes secundarias coincidentes. No pude leer la fuente
 * primaria del regulador. Para contra entrega importa de verdad, porque el
 * repartidor llama: un teléfono mal escrito es un RTO casi seguro.
 *
 * Sin dependencias. Pura. Sin red.
 */

/** Resultados posibles de validar un campo. */
export const FIELD_STATUS = Object.freeze({
  OK: 'ok',
  MISSING: 'missing',
  MALFORMED: 'malformed',
  NOT_COVERED: 'not_covered',
  UNKNOWN: 'unknown',
});

/** Tipos de línea telefónica que se reconocen. */
export const PHONE_KIND = Object.freeze({
  MOBILE: 'mobile',
  LANDLINE: 'landline',
  UNKNOWN: 'unknown',
});

/**
 * Reduce un teléfono a dígitos y le quita el código de país colombiano.
 *
 * Acepta las formas con las que la gente escribe de verdad: `+57 300 123 4567`,
 * `300-123-4567`, `(601) 234 5678`, `0057...`. No acepta letras.
 *
 * @param {unknown} input
 * @returns {{digits: string, hadCountryCode: boolean}|null}
 */
function toNationalDigits(input) {
  if (typeof input !== 'string') return null;
  if (/[a-zA-Z]/.test(input)) return null;

  let digits = input.replace(/\D/g, '');
  if (digits === '') return null;

  let hadCountryCode = false;
  // `0057` o `0057...` como forma de marcar internacionalmente.
  if (digits.startsWith('0057')) {
    digits = digits.slice(4);
    hadCountryCode = true;
  } else if (digits.length > 10 && digits.startsWith('57')) {
    digits = digits.slice(2);
    hadCountryCode = true;
  }

  return { digits, hadCountryCode };
}

/**
 * Valida la forma de un teléfono colombiano.
 *
 * @param {unknown} input
 * @returns {{status: string, kind: string, e164?: string, national?: string, reason?: string}}
 */
export function validateColombianPhone(input) {
  if (input === undefined || input === null || (typeof input === 'string' && input.trim() === '')) {
    return { status: FIELD_STATUS.MISSING, kind: PHONE_KIND.UNKNOWN };
  }

  const parsed = toNationalDigits(input);
  if (parsed === null) {
    return { status: FIELD_STATUS.MALFORMED, kind: PHONE_KIND.UNKNOWN, reason: 'not_numeric' };
  }

  const { digits } = parsed;

  if (digits.length !== 10) {
    return {
      status: FIELD_STATUS.MALFORMED,
      kind: PHONE_KIND.UNKNOWN,
      reason: digits.length < 10 ? 'too_short' : 'too_long',
    };
  }

  const kind = digits.startsWith('3')
    ? PHONE_KIND.MOBILE
    : digits.startsWith('60')
      ? PHONE_KIND.LANDLINE
      : PHONE_KIND.UNKNOWN;

  if (kind === PHONE_KIND.UNKNOWN) {
    return { status: FIELD_STATUS.MALFORMED, kind, reason: 'unknown_prefix' };
  }

  return {
    status: FIELD_STATUS.OK,
    kind,
    national: digits,
    e164: `+57${digits}`,
  };
}

/**
 * Normaliza un nombre de municipio para comparar.
 *
 * Reduce a letras y dígitos sin acentos: **se quitan también los espacios**.
 *
 * Esa decisión salió de un fallo real que detectaron las pruebas. Con una versión
 * que solo colapsaba espacios, `"Bogotá D.C."` daba `"bogota d c"` y
 * `"bogota dc"` daba `"bogota dc"`: dos formas del mismo municipio que no
 * casaban, así que un comprador de Bogotá podía quedarse sin contra entrega por
 * escribir los puntos de otra manera. En contra entrega eso es una venta perdida
 * por un detalle tipográfico.
 *
 * La misma versión decía conservar la `ñ` y no lo hacía: NFD la descompone y el
 * filtro de diacríticos se la comía. Ahora la regla es explícita y coherente —
 * `ñ` pasa a `n`, igual que las vocales acentuadas — así que `"Muñoz"` y
 * `"Munoz"` casan, que es lo que hace falta.
 *
 * Riesgo asumido: quitar espacios podría unir dos nombres distintos. Entre los
 * municipios colombianos reales no se da, y el error contrario —rechazar una
 * entrega posible— cuesta más.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function normalizeMunicipality(name) {
  // `String(x)` lanza con un objeto sin prototipo o con un `toString` que falla.
  // Encontrado por barrido adversario.
  let text;
  if (name === null || name === undefined) text = '';
  else if (typeof name === 'string') text = name;
  else {
    try {
      text = String(name);
    } catch {
      text = '';
    }
  }
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Comprueba si un municipio admite contra entrega.
 *
 * `coverage` se inyecta. Sin lista, el resultado es `UNKNOWN`, **no** `OK`: no
 * saber si se entrega no es poder entregar. Devolver `OK` por defecto sería
 * exactamente la suposición que genera RTO.
 *
 * @param {unknown} municipality
 * @param {Iterable<string>|null|undefined} coverage Municipios con cobertura.
 * @returns {{status: string, normalized?: string}}
 */
export function checkCodCoverage(municipality, coverage) {
  const normalized = normalizeMunicipality(municipality);
  if (normalized === '') return { status: FIELD_STATUS.MISSING };

  if (coverage === null || coverage === undefined) {
    return { status: FIELD_STATUS.UNKNOWN, normalized };
  }

  /** @type {Set<string>} */
  let set;
  try {
    set = new Set([...coverage].map(normalizeMunicipality));
  } catch {
    return { status: FIELD_STATUS.UNKNOWN, normalized };
  }
  if (set.size === 0) return { status: FIELD_STATUS.UNKNOWN, normalized };

  return {
    status: set.has(normalized) ? FIELD_STATUS.OK : FIELD_STATUS.NOT_COVERED,
    normalized,
  };
}

/**
 * @typedef {object} CodDraft
 * @property {string} [fullName]
 * @property {string} [phone]
 * @property {string} [address1]
 * @property {string} [municipality]
 * @property {string} [province]
 */

/**
 * @typedef {object} CodValidation
 * @property {boolean} readyForCheckout  true solo si nada impide continuar.
 * @property {Record<string, {status: string, reason?: string, kind?: string}>} fields
 * @property {string[]} blocking   Campos que impiden continuar.
 * @property {string[]} warnings   No impiden, pero conviene avisar.
 */

/**
 * Valida los datos mínimos de una entrega contra entrega, antes del checkout.
 *
 * Decisión de diseño: un municipio con cobertura **desconocida** no bloquea. Sin
 * lista inyectada, bloquear impediría vender en todo el país por falta de un dato
 * que es nuestro, no del comprador. Se avisa y se deja pasar, porque el checkout
 * de Shopify y Shopify Functions siguen siendo la última palabra sobre qué
 * métodos de pago se ofrecen.
 *
 * @param {CodDraft} draft
 * @param {object} [options]
 * @param {Iterable<string>} [options.codCoverage]
 * @param {boolean} [options.requireMobile] Exigir móvil, no fijo. Por defecto true:
 *   el repartidor de contra entrega llama, y a un fijo puede no contestar nadie.
 * @returns {CodValidation}
 */
export function validateCodDraft(draft, rawOptions = {}) {
  // Un parámetro por defecto solo cubre `undefined`, no `null`. Normalizado
  // explícitamente: §216 exige degradar, no lanzar.
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const d = draft && typeof draft === 'object' ? draft : {};
  const requireMobile = options.requireMobile !== false;

  /** @type {Record<string, any>} */
  const fields = {};
  /** @type {string[]} */ const blocking = [];
  /** @type {string[]} */ const warnings = [];

  /** @param {unknown} v @returns {string} */
  const text = (v) => (typeof v === 'string' ? v.trim() : '');

  // Nombre: sin un nombre el repartidor no sabe por quién preguntar.
  const name = text(d.fullName);
  fields.fullName = { status: name === '' ? FIELD_STATUS.MISSING : name.length < 3 ? FIELD_STATUS.MALFORMED : FIELD_STATUS.OK };
  if (fields.fullName.status !== FIELD_STATUS.OK) blocking.push('fullName');

  // Teléfono: el campo que más RTO evita.
  const phone = validateColombianPhone(d.phone);
  fields.phone = { status: phone.status, kind: phone.kind, reason: phone.reason };
  if (phone.status !== FIELD_STATUS.OK) {
    blocking.push('phone');
  } else if (requireMobile && phone.kind !== PHONE_KIND.MOBILE) {
    fields.phone.status = FIELD_STATUS.MALFORMED;
    fields.phone.reason = 'landline_not_accepted';
    blocking.push('phone');
  }

  // Dirección: se valida que haya algo utilizable, no que exista.
  const address = text(d.address1);
  fields.address1 = { status: address === '' ? FIELD_STATUS.MISSING : address.length < 6 ? FIELD_STATUS.MALFORMED : FIELD_STATUS.OK };
  if (fields.address1.status !== FIELD_STATUS.OK) blocking.push('address1');

  // Municipio y cobertura.
  const coverage = checkCodCoverage(d.municipality, options.codCoverage);
  fields.municipality = { status: coverage.status };
  if (coverage.status === FIELD_STATUS.MISSING) blocking.push('municipality');
  else if (coverage.status === FIELD_STATUS.NOT_COVERED) blocking.push('municipality');
  else if (coverage.status === FIELD_STATUS.UNKNOWN) {
    warnings.push('cobertura_de_contra_entrega_no_verificada');
  }

  const province = text(d.province);
  fields.province = { status: province === '' ? FIELD_STATUS.MISSING : FIELD_STATUS.OK };
  if (fields.province.status !== FIELD_STATUS.OK) warnings.push('province_missing');

  return { readyForCheckout: blocking.length === 0, fields, blocking, warnings };
}
