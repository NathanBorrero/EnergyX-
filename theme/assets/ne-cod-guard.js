/* generado desde src/lib/cod-guard.js — no editar, ver scripts/sync-theme-assets.mjs */
export const FIELD_STATUS = Object.freeze({
  OK: 'ok',
  MISSING: 'missing',
  MALFORMED: 'malformed',
  NOT_COVERED: 'not_covered',
  UNKNOWN: 'unknown',
});

export const PHONE_KIND = Object.freeze({
  MOBILE: 'mobile',
  LANDLINE: 'landline',
  UNKNOWN: 'unknown',
});

function toNationalDigits(input) {
  if (typeof input !== 'string') return null;
  if (/[a-zA-Z]/.test(input)) return null;

  let digits = input.replace(/\D/g, '');
  if (digits === '') return null;

  let hadCountryCode = false;
  if (digits.startsWith('0057')) {
    digits = digits.slice(4);
    hadCountryCode = true;
  } else if (digits.length > 10 && digits.startsWith('57')) {
    digits = digits.slice(2);
    hadCountryCode = true;
  }

  return { digits, hadCountryCode };
}

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

export function normalizeMunicipality(name) {
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

export function checkCodCoverage(municipality, coverage) {
  const normalized = normalizeMunicipality(municipality);
  if (normalized === '') return { status: FIELD_STATUS.MISSING };

  if (coverage === null || coverage === undefined) {
    return { status: FIELD_STATUS.UNKNOWN, normalized };
  }

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

export function validateCodDraft(draft, rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const d = draft && typeof draft === 'object' ? draft : {};
  const requireMobile = options.requireMobile !== false;

  const fields = {};
 const blocking = [];
 const warnings = [];

  const text = (v) => (typeof v === 'string' ? v.trim() : '');

  const name = text(d.fullName);
  fields.fullName = { status: name === '' ? FIELD_STATUS.MISSING : name.length < 3 ? FIELD_STATUS.MALFORMED : FIELD_STATUS.OK };
  if (fields.fullName.status !== FIELD_STATUS.OK) blocking.push('fullName');

  const phone = validateColombianPhone(d.phone);
  fields.phone = { status: phone.status, kind: phone.kind, reason: phone.reason };
  if (phone.status !== FIELD_STATUS.OK) {
    blocking.push('phone');
  } else if (requireMobile && phone.kind !== PHONE_KIND.MOBILE) {
    fields.phone.status = FIELD_STATUS.MALFORMED;
    fields.phone.reason = 'landline_not_accepted';
    blocking.push('phone');
  }

  const address = text(d.address1);
  fields.address1 = { status: address === '' ? FIELD_STATUS.MISSING : address.length < 6 ? FIELD_STATUS.MALFORMED : FIELD_STATUS.OK };
  if (fields.address1.status !== FIELD_STATUS.OK) blocking.push('address1');

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
