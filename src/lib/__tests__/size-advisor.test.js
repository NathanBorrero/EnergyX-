import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recommendSize, reconcileWithStock, CONFIDENCE } from '../size-advisor.js';

/**
 * ⚠️ TABLA DE PRUEBA, NO DATOS DE NATHAN & ESTEBAN.
 *
 * Las longitudes de abajo existen solo para ejercitar la aritmética. Los datos
 * reales tienen que venir del fabricante o de medición física del producto
 * (§191). Si alguien copia estos números a producción, provoca el RTO que este
 * módulo intenta evitar.
 */
const CHART_DE_PRUEBA = Object.freeze([
  { label: '39', footLengthCm: 24.5 },
  { label: '40', footLengthCm: 25.2 },
  { label: '41', footLengthCm: 25.9 },
  { label: '42', footLengthCm: 26.6 },
  { label: '43', footLengthCm: 27.3 },
]);

describe('recommendSize — coincidencia exacta', () => {
  test('una medida que cae justo en una talla la devuelve con confianza exacta', () => {
    const r = recommendSize(25.9, CHART_DE_PRUEBA);
    assert.equal(r.label, '41');
    assert.equal(r.confidence, CONFIDENCE.EXACT);
    assert.equal(r.reason, 'exact_match');
    assert.equal(r.slackCm, 0);
  });

  test('ofrece las tallas colindantes como alternativa', () => {
    const r = recommendSize(25.9, CHART_DE_PRUEBA);
    assert.deepEqual(r.alternatives.map((a) => a.label), ['40', '42']);
  });
});

describe('recommendSize — entre dos tallas', () => {
  test('por defecto sube, porque un zapato holgado se usa y uno pequeño no', () => {
    const r = recommendSize(25.5, CHART_DE_PRUEBA); // entre 40 (25.2) y 41 (25.9)
    assert.equal(r.label, '41');
    assert.equal(r.confidence, CONFIDENCE.ROUNDED);
    assert.equal(r.reason, 'rounded_up');
  });

  test('la política de redondeo es configurable', () => {
    assert.equal(recommendSize(25.5, CHART_DE_PRUEBA, { rounding: 'down' }).label, '40');
    assert.equal(recommendSize(25.3, CHART_DE_PRUEBA, { rounding: 'nearest' }).label, '40');
    assert.equal(recommendSize(25.8, CHART_DE_PRUEBA, { rounding: 'nearest' }).label, '41');
  });

  test('informa de la holgura resultante', () => {
    const r = recommendSize(25.5, CHART_DE_PRUEBA);
    assert.equal(r.slackCm, 0.4); // 25.9 - 25.5
  });

  test('da ambas tallas colindantes como alternativa', () => {
    const r = recommendSize(25.5, CHART_DE_PRUEBA);
    assert.deepEqual(r.alternatives.map((a) => a.label), ['40']);
  });
});

describe('recommendSize — holgura', () => {
  test('la holgura desplaza la búsqueda', () => {
    // 25.2 exacta sería la 40; con 0.5 de holgura pasa a 25.7, que sube a la 41.
    const r = recommendSize(25.2, CHART_DE_PRUEBA, { easeCm: 0.5 });
    assert.equal(r.label, '41');
  });
});

describe('recommendSize — fuera de rango', () => {
  test('por debajo de la talla más pequeña no inventa una talla', () => {
    const r = recommendSize(20.0, CHART_DE_PRUEBA);
    assert.equal(r.label, null);
    assert.equal(r.confidence, CONFIDENCE.OUT_OF_RANGE);
    assert.equal(r.reason, 'below_smallest');
    assert.deepEqual(r.alternatives.map((a) => a.label), ['39']);
  });

  test('por encima de la más grande tampoco', () => {
    const r = recommendSize(31.0, CHART_DE_PRUEBA);
    assert.equal(r.label, null);
    assert.equal(r.reason, 'above_largest');
    assert.deepEqual(r.alternatives.map((a) => a.label), ['43']);
  });

  test('los extremos exactos sí están dentro de rango', () => {
    assert.equal(recommendSize(24.5, CHART_DE_PRUEBA).label, '39');
    assert.equal(recommendSize(27.3, CHART_DE_PRUEBA).label, '43');
  });
});

describe('recommendSize — entrada defectuosa (§216)', () => {
  test('sin tabla no recomienda, y lo dice', () => {
    for (const chart of [[], null, undefined, 'no es una tabla']) {
      const r = recommendSize(26.0, chart);
      assert.equal(r.label, null);
      assert.equal(r.confidence, CONFIDENCE.NO_DATA);
      assert.equal(r.reason, 'chart_empty');
    }
  });

  test('medidas inválidas no recomiendan', () => {
    for (const m of [0, -5, NaN, Infinity, null, undefined, '26']) {
      const r = recommendSize(m, CHART_DE_PRUEBA);
      assert.equal(r.label, null, `fallo con ${String(m)}`);
      assert.equal(r.reason, 'measurement_invalid');
    }
  });

  test('descarta filas inutilizables en lugar de fallar', () => {
    const sucia = [
      { label: '', footLengthCm: 24.0 },
      { label: '40', footLengthCm: 25.2 },
      { label: '41', footLengthCm: null },
      null,
      { label: '42', footLengthCm: 26.6 },
      { label: '  43  ', footLengthCm: 27.3 },
    ];
    const r = recommendSize(26.6, sucia);
    assert.equal(r.label, '42');
    assert.equal(recommendSize(27.3, sucia).label, '43'); // se recorta el espacio
  });

  test('ordena una tabla desordenada', () => {
    const desordenada = [
      { label: '43', footLengthCm: 27.3 },
      { label: '39', footLengthCm: 24.5 },
      { label: '41', footLengthCm: 25.9 },
    ];
    const r = recommendSize(25.0, desordenada);
    assert.equal(r.label, '41'); // sube desde 24.5
  });

  test('una tabla de una sola talla funciona', () => {
    const r = recommendSize(26.6, [{ label: '42', footLengthCm: 26.6 }]);
    assert.equal(r.label, '42');
    assert.equal(r.confidence, CONFIDENCE.EXACT);
    assert.deepEqual(r.alternatives, []);
  });
});

describe('reconcileWithStock — no recomendar lo que no se puede comprar', () => {
  test('si la recomendada está comprable, no cambia nada', () => {
    const r = recommendSize(25.9, CHART_DE_PRUEBA);
    const out = reconcileWithStock(r, ['40', '41', '42'], CHART_DE_PRUEBA);
    assert.equal(out.label, '41');
    assert.equal(out.substituted, false);
  });

  test('si está agotada, sustituye por la comprable más cercana y lo declara', () => {
    const r = recommendSize(25.9, CHART_DE_PRUEBA); // 41
    const out = reconcileWithStock(r, ['40', '42'], CHART_DE_PRUEBA);
    assert.equal(out.substituted, true);
    assert.equal(out.reason, 'substituted_for_stock');
    assert.equal(out.label, '42'); // empate en distancia: prefiere subir
  });

  test('prefiere la verdaderamente más cercana cuando no hay empate', () => {
    const r = recommendSize(25.2, CHART_DE_PRUEBA); // 40
    const out = reconcileWithStock(r, ['39', '43'], CHART_DE_PRUEBA);
    assert.equal(out.label, '39'); // 25.2-24.5=0.7 vs 27.3-25.2=2.1
  });

  test('sin nada comprable no inventa una talla', () => {
    const r = recommendSize(25.9, CHART_DE_PRUEBA);
    const out = reconcileWithStock(r, [], CHART_DE_PRUEBA);
    assert.equal(out.substituted, false);
    assert.equal(out.reason, 'recommended_out_of_stock');
  });

  test('una recomendación fuera de rango se deja como está', () => {
    const r = recommendSize(31.0, CHART_DE_PRUEBA);
    const out = reconcileWithStock(r, ['42', '43'], CHART_DE_PRUEBA);
    assert.equal(out.label, null);
    assert.equal(out.confidence, CONFIDENCE.OUT_OF_RANGE);
  });

  test('entrada defectuosa en la lista de stock no explota', () => {
    const r = recommendSize(25.9, CHART_DE_PRUEBA);
    for (const stock of [null, undefined, 'no es lista']) {
      const out = reconcileWithStock(r, stock, CHART_DE_PRUEBA);
      assert.ok(out);
    }
  });
});

describe('regresión — coma flotante en centímetros', () => {
  /**
   * Bug real detectado por estas pruebas, no teórico.
   *
   * Las longitudes se escriben con un decimal, pero en coma flotante:
   *   25.9 - 25.2 = 0.6999999999999957
   *   26.6 - 25.9 = 0.7000000000000028
   *
   * Dos distancias que deberían empatar no lo hacían, así que el desempate
   * ("ante igualdad, sube") nunca se aplicaba y se elegía la talla menor.
   * Corregido comparando con tolerancia EPSILON_CM.
   */
  test('distancias que empatan en cm empatan de verdad, y el desempate sube', () => {
    const r = recommendSize(25.9, CHART_DE_PRUEBA); // 41, longitud 25.9
    // 40 está a 0.7 por debajo; 42 a 0.7 por encima. Debe ganar la 42.
    const out = reconcileWithStock(r, ['40', '42'], CHART_DE_PRUEBA);
    assert.equal(out.label, '42');
    assert.equal(out.substituted, true);
  });

  test('una medida que coincide con una talla tras sumar holgura se detecta como exacta', () => {
    // 25.2 + 0.7 = 25.900000000000002 en coma flotante, no 25.9.
    const r = recommendSize(25.2, CHART_DE_PRUEBA, { easeCm: 0.7 });
    assert.equal(r.label, '41');
    assert.equal(r.confidence, CONFIDENCE.EXACT);
  });

  test('los extremos del rango no se salen por error de redondeo', () => {
    // 24.0 + 0.5 = 24.5, el extremo inferior exacto.
    const r = recommendSize(24.0, CHART_DE_PRUEBA, { easeCm: 0.5 });
    assert.equal(r.confidence, CONFIDENCE.EXACT);
    assert.equal(r.label, '39');
  });
});

describe('integración — la cadena completa', () => {
  test('medida del comprador hasta talla comprable', () => {
    // El comprador mide 25.5 cm. La 41 sería la suya, pero está agotada.
    const recomendada = recommendSize(25.5, CHART_DE_PRUEBA);
    assert.equal(recomendada.label, '41');

    const final = reconcileWithStock(recomendada, ['39', '40', '42'], CHART_DE_PRUEBA);
    assert.equal(final.substituted, true);
    assert.equal(final.label, '42');
    // La interfaz puede decir: "tu talla es la 41, está agotada, la 42 es la más
    // cercana disponible" — en lugar de ofrecer una 41 que no se puede comprar.
  });
});
