import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateColombianPhone,
  normalizeMunicipality,
  checkCodCoverage,
  validateCodDraft,
  FIELD_STATUS,
  PHONE_KIND,
} from '../cod-guard.js';

describe('validateColombianPhone — móviles', () => {
  test('acepta las formas en que la gente escribe de verdad', () => {
    for (const input of [
      '3001234567', '300 123 4567', '300-123-4567', '+57 300 123 4567',
      '+573001234567', '57 300 123 4567', '0057 300 123 4567', '(300) 1234567',
    ]) {
      const r = validateColombianPhone(input);
      assert.equal(r.status, FIELD_STATUS.OK, `rechazó ${input}`);
      assert.equal(r.kind, PHONE_KIND.MOBILE);
      assert.equal(r.e164, '+573001234567');
      assert.equal(r.national, '3001234567');
    }
  });

  test('reconoce cualquier bloque de operador que empiece por 3', () => {
    for (const prefix of ['300', '310', '320', '321', '350', '390']) {
      assert.equal(validateColombianPhone(`${prefix}1234567`).kind, PHONE_KIND.MOBILE);
    }
  });
});

describe('validateColombianPhone — fijos', () => {
  test('reconoce fijos con el prefijo 60X', () => {
    assert.equal(validateColombianPhone('6012345678').kind, PHONE_KIND.LANDLINE);
    assert.equal(validateColombianPhone('+57 602 234 5678').kind, PHONE_KIND.LANDLINE);
  });
});

describe('validateColombianPhone — rechazos', () => {
  test('la longitud debe ser exactamente 10 tras la renumeración de 2021', () => {
    assert.equal(validateColombianPhone('300123456').reason, 'too_short');
    assert.equal(validateColombianPhone('30012345678').reason, 'too_long');
  });

  test('un prefijo que no es móvil ni fijo se rechaza', () => {
    for (const n of ['1001234567', '2001234567', '4001234567', '9001234567', '6112345678']) {
      const r = validateColombianPhone(n);
      assert.equal(r.status, FIELD_STATUS.MALFORMED, `aceptó ${n}`);
    }
  });

  test('letras se rechazan en lugar de limpiarse', () => {
    assert.equal(validateColombianPhone('300ABC4567').reason, 'not_numeric');
    assert.equal(validateColombianPhone('llámame').reason, 'not_numeric');
  });

  test('vacío o ausente es MISSING, no MALFORMED', () => {
    for (const v of [undefined, null, '', '   ']) {
      assert.equal(validateColombianPhone(v).status, FIELD_STATUS.MISSING);
    }
  });

  test('tipos no cadena se rechazan sin lanzar', () => {
    for (const v of [3001234567, {}, [], true]) {
      assert.doesNotThrow(() => validateColombianPhone(v));
      assert.notEqual(validateColombianPhone(v).status, FIELD_STATUS.OK);
    }
  });
});

describe('normalizeMunicipality', () => {
  /**
   * Estas pruebas detectaron dos defectos reales: "Bogotá D.C." y "bogota dc" no
   * casaban, y la ñ se perdía pese a estar en el charset permitido. Siguen aquí
   * para que no vuelvan.
   */
  test('iguala todas las formas en que se escribe el mismo sitio', () => {
    const esperado = 'bogotadc';
    for (const v of ['Bogotá D.C.', 'bogota dc', 'BOGOTA  D C', ' Bogotá   D.C. ', 'Bogotá-D.C.']) {
      assert.equal(normalizeMunicipality(v), esperado, `falló con ${v}`);
    }
  });

  test('la ñ pasa a n de forma coherente, así que Muñoz y Munoz casan', () => {
    assert.equal(normalizeMunicipality('Muñoz'), 'munoz');
    assert.equal(normalizeMunicipality('Munoz'), normalizeMunicipality('Muñoz'));
  });

  test('municipios de varias palabras casan escritos de cualquier manera', () => {
    const esperado = normalizeMunicipality('San José de Cúcuta');
    for (const v of ['san jose de cucuta', 'SAN JOSE DE CUCUTA', 'SanJosé  de Cúcuta']) {
      assert.equal(normalizeMunicipality(v), esperado, `falló con ${v}`);
    }
  });

  test('entrada vacía o rara da cadena vacía', () => {
    for (const v of [null, undefined, '', '  ', '...', '---']) {
      assert.equal(normalizeMunicipality(v), '');
    }
  });
});

describe('checkCodCoverage — sin lista NO se asume cobertura', () => {
  const coverage = ['Bogotá D.C.', 'Medellín', 'Cali'];

  test('un municipio en la lista tiene cobertura', () => {
    assert.equal(checkCodCoverage('bogota dc', coverage).status, FIELD_STATUS.OK);
    assert.equal(checkCodCoverage('MEDELLIN', coverage).status, FIELD_STATUS.OK);
  });

  test('uno fuera de la lista no la tiene', () => {
    assert.equal(checkCodCoverage('Leticia', coverage).status, FIELD_STATUS.NOT_COVERED);
  });

  test('sin lista el estado es UNKNOWN, nunca OK', () => {
    for (const c of [null, undefined, [], new Set()]) {
      const r = checkCodCoverage('Bogotá', c);
      assert.equal(r.status, FIELD_STATUS.UNKNOWN, 'no saber no es poder entregar');
    }
  });

  test('municipio ausente es MISSING', () => {
    assert.equal(checkCodCoverage('', coverage).status, FIELD_STATUS.MISSING);
    assert.equal(checkCodCoverage(null, coverage).status, FIELD_STATUS.MISSING);
  });

  test('una cobertura no iterable no lanza', () => {
    assert.doesNotThrow(() => checkCodCoverage('Bogotá', 42));
    assert.equal(checkCodCoverage('Bogotá', 42).status, FIELD_STATUS.UNKNOWN);
  });
});

describe('validateCodDraft', () => {
  const valido = {
    fullName: 'Nombre Apellido',
    phone: '3001234567',
    address1: 'Calle 1 # 2-3, apto 4',
    municipality: 'Bogotá D.C.',
    province: 'Cundinamarca',
  };
  const coverage = ['Bogotá D.C.'];

  test('un borrador completo y con cobertura está listo', () => {
    const r = validateCodDraft(valido, { codCoverage: coverage });
    assert.equal(r.readyForCheckout, true);
    assert.deepEqual(r.blocking, []);
  });

  test('un fijo se rechaza por defecto: el repartidor llama', () => {
    const r = validateCodDraft({ ...valido, phone: '6012345678' }, { codCoverage: coverage });
    assert.equal(r.readyForCheckout, false);
    assert.ok(r.blocking.includes('phone'));
    assert.equal(r.fields.phone.reason, 'landline_not_accepted');
  });

  test('se puede permitir fijo explícitamente', () => {
    const r = validateCodDraft({ ...valido, phone: '6012345678' }, { codCoverage: coverage, requireMobile: false });
    assert.equal(r.readyForCheckout, true);
  });

  test('un municipio sin cobertura bloquea', () => {
    const r = validateCodDraft({ ...valido, municipality: 'Leticia' }, { codCoverage: coverage });
    assert.equal(r.readyForCheckout, false);
    assert.ok(r.blocking.includes('municipality'));
  });

  test('cobertura desconocida NO bloquea, avisa', () => {
    // Bloquear por un dato que es nuestro impediría vender en todo el país.
    const r = validateCodDraft(valido);
    assert.equal(r.readyForCheckout, true);
    assert.ok(r.warnings.includes('cobertura_de_contra_entrega_no_verificada'));
  });

  test('nombre, dirección y teléfono ausentes bloquean', () => {
    const r = validateCodDraft({});
    assert.equal(r.readyForCheckout, false);
    for (const f of ['fullName', 'phone', 'address1', 'municipality']) {
      assert.ok(r.blocking.includes(f), `${f} debería bloquear`);
    }
  });

  test('una dirección demasiado corta para ser útil se marca malformada', () => {
    const r = validateCodDraft({ ...valido, address1: 'Cl 1' }, { codCoverage: coverage });
    assert.equal(r.fields.address1.status, FIELD_STATUS.MALFORMED);
    assert.ok(r.blocking.includes('address1'));
  });

  test('departamento ausente avisa pero no bloquea', () => {
    const r = validateCodDraft({ ...valido, province: '' }, { codCoverage: coverage });
    assert.equal(r.readyForCheckout, true);
    assert.ok(r.warnings.includes('province_missing'));
  });

  test('entrada basura no lanza', () => {
    for (const bad of [null, undefined, 'texto', 42, []]) {
      assert.doesNotThrow(() => validateCodDraft(bad));
      assert.equal(validateCodDraft(bad).readyForCheckout, false);
    }
  });

  test('informa el estado de cada campo, para señalar el correcto en la interfaz', () => {
    const r = validateCodDraft({ ...valido, phone: '123' }, { codCoverage: coverage });
    assert.equal(r.fields.fullName.status, FIELD_STATUS.OK);
    assert.equal(r.fields.phone.status, FIELD_STATUS.MALFORMED);
    assert.equal(r.fields.address1.status, FIELD_STATUS.OK);
  });
});
