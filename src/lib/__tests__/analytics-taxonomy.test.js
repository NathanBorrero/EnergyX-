import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE,
  STAGE_ORDER,
  STAGE_META,
  SOURCE,
  LEVEL,
  consentGatedStages,
  authoritativeStages,
  unverifiedStages,
  funnelFrom,
} from '../analytics-taxonomy.js';

describe('taxonomía — integridad', () => {
  test('las diez etapas están en orden y sin huecos', () => {
    assert.equal(STAGE_ORDER.length, 10);
    assert.equal(STAGE_ORDER[0], STAGE.SESSION);
    assert.equal(STAGE_ORDER[STAGE_ORDER.length - 1], STAGE.ORDER_RETURNED);
  });

  test('toda etapa tiene metadatos completos', () => {
    for (const stage of STAGE_ORDER) {
      const m = STAGE_META[stage];
      assert.ok(m, `falta meta de ${stage}`);
      assert.equal(typeof m.label, 'string');
      assert.ok(Object.values(SOURCE).includes(m.source), `source inválido en ${stage}`);
      assert.equal(typeof m.consentGated, 'boolean');
      assert.ok(Object.values(LEVEL).includes(m.level), `level inválido en ${stage}`);
    }
  });

  test('una etapa sin mecanismo confirmado no se marca VERIFICADO', () => {
    for (const stage of STAGE_ORDER) {
      const m = STAGE_META[stage];
      if (m.mechanism === null) {
        assert.notEqual(m.level, LEVEL.VERIFICADO, `${stage} no puede ser VERIFICADO sin mecanismo`);
      }
    }
  });

  test('toda etapa no verificada explica por qué', () => {
    for (const stage of unverifiedStages()) {
      if (STAGE_META[stage].level === LEVEL.NO_VERIFICADO) {
        assert.ok(STAGE_META[stage].note, `${stage} debe explicar qué falta`);
      }
    }
  });
});

describe('taxonomía — separación de los dos mundos', () => {
  test('el embudo de storefront está sujeto a consentimiento', () => {
    const gated = consentGatedStages();
    assert.deepEqual(gated, [
      STAGE.SESSION,
      STAGE.PRODUCT_VIEWED,
      STAGE.SIZE_SELECTED,
      STAGE.ADDED_TO_CART,
      STAGE.CHECKOUT_STARTED,
    ]);
  });

  test('las etapas de negocio son autoritativas y no dependen de consentimiento', () => {
    const auth = authoritativeStages();
    assert.deepEqual(auth, [
      STAGE.ORDER_CREATED,
      STAGE.ORDER_CONFIRMED,
      STAGE.ORDER_SHIPPED,
      STAGE.ORDER_DELIVERED,
      STAGE.ORDER_RETURNED,
    ]);
  });

  test('ninguna etapa de cliente se marca como autoritativa', () => {
    for (const stage of consentGatedStages()) {
      assert.equal(STAGE_META[stage].source, SOURCE.WEB_PIXEL);
    }
  });

  test('pedido creado está documentado explícitamente como NO venta', () => {
    assert.match(STAGE_META[STAGE.ORDER_CREATED].note, /NO es una venta/);
  });

  test('selección de talla queda NO VERIFICADO, no inventado', () => {
    const m = STAGE_META[STAGE.SIZE_SELECTED];
    assert.equal(m.level, LEVEL.NO_VERIFICADO);
    assert.equal(m.mechanism, null);
  });

  test('entrega y RTO quedan NO VERIFICADO', () => {
    assert.equal(STAGE_META[STAGE.ORDER_DELIVERED].level, LEVEL.NO_VERIFICADO);
    assert.equal(STAGE_META[STAGE.ORDER_RETURNED].level, LEVEL.NO_VERIFICADO);
  });
});

describe('funnelFrom — la métrica bonita contra la honesta', () => {
  const escenario = {
    [STAGE.SESSION]: 10000,
    [STAGE.PRODUCT_VIEWED]: 4000,
    [STAGE.SIZE_SELECTED]: 1500,
    [STAGE.ADDED_TO_CART]: 800,
    [STAGE.CHECKOUT_STARTED]: 500,
    [STAGE.ORDER_CREATED]: 300,
    [STAGE.ORDER_CONFIRMED]: 180,
    [STAGE.ORDER_SHIPPED]: 290,
    [STAGE.ORDER_DELIVERED]: 180,
    [STAGE.ORDER_RETURNED]: 110,
  };

  test('la conversión aparente es pedidos creados sobre visitas', () => {
    const f = funnelFrom(escenario);
    assert.equal(f.apparentConversion, 0.03); // 300/10000
  });

  test('la conversión real es entregados sobre visitas', () => {
    const f = funnelFrom(escenario);
    assert.equal(f.realConversion, 0.018); // 180/10000
  });

  test('cuantifica cuánto exagera la métrica aparente', () => {
    const f = funnelFrom(escenario);
    assert.equal(f.overstatement, 1.67); // la bonita infla un 67%
  });

  test('calcula la tasa de RTO sobre enviados, no sobre creados', () => {
    const f = funnelFrom(escenario);
    assert.equal(f.rtoRate, 0.3793); // 110/290
  });

  test('calcula las tasas de paso del embudo', () => {
    const f = funnelFrom(escenario);
    assert.equal(f.stepRates.session_to_product_viewed, 0.4);
    assert.equal(f.stepRates.added_to_cart_to_checkout_started, 0.625);
  });

  test('el RTO no se cuenta como un paso hacia delante del embudo', () => {
    const f = funnelFrom(escenario);
    assert.equal('order_delivered_to_order_returned' in f.stepRates, false);
  });
});

describe('funnelFrom — no confundir sin dato con cero', () => {
  test('sin visitas, las tasas son null y no 0', () => {
    const f = funnelFrom({ [STAGE.ORDER_CREATED]: 5 });
    assert.equal(f.apparentConversion, null);
    assert.equal(f.realConversion, null);
    assert.equal(f.paidConversion, null);
  });

  test('sin envíos, la tasa de RTO es null', () => {
    const f = funnelFrom({ [STAGE.SESSION]: 100, [STAGE.ORDER_RETURNED]: 3 });
    assert.equal(f.rtoRate, null);
  });

  test('sin entregas no se calcula exageración, se avisa', () => {
    const f = funnelFrom({ [STAGE.SESSION]: 1000, [STAGE.ORDER_CREATED]: 30 });
    assert.equal(f.overstatement, null);
    assert.ok(f.caveats.some((c) => /conversión real no se\s+puede afirmar|conversión real/.test(c)));
  });

  test('avisa cuando hay pedidos pero ninguno pagado', () => {
    const f = funnelFrom({ [STAGE.SESSION]: 1000, [STAGE.ORDER_CREATED]: 30 });
    assert.ok(f.caveats.some((c) => /orders\/paid/.test(c)));
  });

  test('avisa cuando falta instrumentar la selección de talla', () => {
    const f = funnelFrom({ [STAGE.SESSION]: 1000, [STAGE.PRODUCT_VIEWED]: 400 });
    assert.ok(f.caveats.some((c) => /selección de talla/.test(c)));
  });
});

describe('funnelFrom — entrada defectuosa (§216)', () => {
  test('entrada vacía devuelve una estructura completa y utilizable', () => {
    const f = funnelFrom({});
    assert.equal(Object.keys(f.counts).length, 10);
    for (const stage of STAGE_ORDER) assert.equal(f.counts[stage], 0);
    assert.equal(f.apparentConversion, null);
  });

  test('null, undefined y tipos raros no explotan', () => {
    for (const bad of [null, undefined, 'texto', 42, []]) {
      assert.doesNotThrow(() => funnelFrom(bad));
      assert.equal(funnelFrom(bad).counts[STAGE.SESSION], 0);
    }
  });

  test('valores inválidos se sanean a 0 en lugar de propagar NaN', () => {
    const f = funnelFrom({
      [STAGE.SESSION]: 'mil',
      [STAGE.PRODUCT_VIEWED]: -50,
      [STAGE.ADDED_TO_CART]: NaN,
      [STAGE.CHECKOUT_STARTED]: Infinity,
      [STAGE.ORDER_CREATED]: null,
    });
    for (const stage of STAGE_ORDER) {
      assert.equal(Number.isFinite(f.counts[stage]), true);
      assert.ok(f.counts[stage] >= 0);
    }
  });

  test('etapas desconocidas se ignoran sin contaminar la salida', () => {
    const f = funnelFrom({ etapa_inventada: 999, [STAGE.SESSION]: 10 });
    assert.equal('etapa_inventada' in f.counts, false);
    assert.equal(f.counts[STAGE.SESSION], 10);
  });

  test('ninguna tasa sale como Infinity', () => {
    const f = funnelFrom({ [STAGE.ORDER_DELIVERED]: 10 });
    for (const v of Object.values(f.stepRates)) {
      if (v !== null) assert.equal(Number.isFinite(v), true);
    }
  });
});

describe('integración — el caso que justifica el módulo', () => {
  test('un negocio que parece rentable y no lo es queda al descubierto', () => {
    // 300 pedidos creados sobre 10.000 visitas parece un 3% de conversión.
    // Pero 110 de los 290 enviados se devolvieron: el 38% del envío se perdió.
    const f = funnelFrom({
      [STAGE.SESSION]: 10000,
      [STAGE.ORDER_CREATED]: 300,
      [STAGE.ORDER_SHIPPED]: 290,
      [STAGE.ORDER_DELIVERED]: 180,
      [STAGE.ORDER_RETURNED]: 110,
    });

    assert.equal(f.apparentConversion, 0.03);  // lo que se celebraría
    assert.equal(f.realConversion, 0.018);     // lo que de verdad ocurrió
    assert.equal(f.overstatement, 1.67);       // 67% de inflación
    assert.ok(f.rtoRate > 0.37);               // la fuga, cuantificada
  });
});
