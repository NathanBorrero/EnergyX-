/**
 * Pruebas de los hallazgos de la auditoría cruzada de módulos.
 *
 * Cada bloque corresponde a un defecto real medido antes de corregirlo, no a un
 * caso hipotético. Existen para que esos defectos no vuelvan (§196).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createVariantMatrix, VALUE_STATUS } from '../variant-matrix.js';
import { buildProductGroupJsonLd, serializeJsonLd, collisionsIn, rejectedIn, VARIES_BY } from '../product-jsonld.js';
import { recommendSize, reconcileWithStock } from '../size-advisor.js';
import { foldKey, isPurchasable, hasAvailabilityData } from '../shopify-semantics.js';

const VARIANTS = [
  {
    id: '1',
    selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }],
    availableForSale: true,
  },
  {
    id: '2',
    selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '43' }],
    availableForSale: false,
  },
  {
    id: '3',
    selectedOptions: [{ name: 'Color', value: 'Café' }, { name: 'Talla', value: '42' }],
    availableForSale: true,
  },
];

describe('HALLAZGO 1 — nombres de opción se comparaban exactos, valores plegados', () => {
  /**
   * Antes: `resolve({ talla: '42' })` devolvía null y `statusFor('talla', ...)`
   * devolvía 'nonexistent' — indistinguible de "esta combinación no existe",
   * que es el peor modo de fallo posible en un selector de talla.
   */
  test('un nombre de opción en otra caja ya casa', () => {
    const m = createVariantMatrix(VARIANTS);
    assert.equal(m.resolve({ color: 'Negro', talla: '42' })?.id, '1');
    assert.equal(m.statusFor('talla', '42', { color: 'Negro' }), VALUE_STATUS.AVAILABLE);
  });

  test('un nombre con acento distinto también casa', () => {
    const m = createVariantMatrix([
      {
        id: 'x',
        selectedOptions: [{ name: 'Talla', value: '42' }],
        availableForSale: true,
      },
    ]);
    assert.equal(m.statusFor('TALLA', '42'), VALUE_STATUS.AVAILABLE);
  });

  test('los valores con acento se comparan plegados pero se muestran enteros', () => {
    const m = createVariantMatrix(VARIANTS);
    assert.equal(m.resolve({ Color: 'cafe', Talla: '42' })?.id, '3');
    assert.deepEqual([...m.options[0].values], ['Negro', 'Café']); // display intacto
  });

  test('statusesFor con nombre no canónico devuelve los valores, no vacío', () => {
    const m = createVariantMatrix(VARIANTS);
    assert.equal(m.statusesFor('talla').length, 2);
  });

  test('reconcile acepta nombres no canónicos', () => {
    const m = createVariantMatrix(VARIANTS);
    const next = m.reconcile({ color: 'Negro', talla: '42' }, 'color');
    assert.equal(m.resolve(next)?.id, '1');
  });

  test('una opción que de verdad no existe sigue siendo nonexistent', () => {
    const m = createVariantMatrix(VARIANTS);
    assert.equal(m.statusFor('Material', 'Cuero'), VALUE_STATUS.NONEXISTENT);
  });
});

describe('HALLAZGO 2 — la definición de "comprable" vivía duplicada', () => {
  test('isPurchasable solo acepta true: no saber no es poder comprar', () => {
    assert.equal(isPurchasable({ availableForSale: true }), true);
    assert.equal(isPurchasable({ availableForSale: false }), false);
    assert.equal(isPurchasable({}), false);
    assert.equal(isPurchasable({ availableForSale: 'true' }), false);
    assert.equal(isPurchasable({ availableForSale: 1 }), false);
    assert.equal(isPurchasable(null), false);
    assert.equal(isPurchasable(undefined), false);
  });

  test('hasAvailabilityData distingue "no comprable" de "sin dato"', () => {
    assert.equal(hasAvailabilityData({ availableForSale: false }), true);
    assert.equal(hasAvailabilityData({}), false);
    assert.equal(hasAvailabilityData({ availableForSale: 'no' }), false);
  });

  test('matrix y jsonld coinciden en los tres casos, porque usan la misma regla', () => {
    for (const availableForSale of [true, false, undefined]) {
      const variant = {
        id: 'v',
        selectedOptions: [{ name: 'Talla', value: '42' }],
        ...(availableForSale === undefined ? {} : { availableForSale }),
      };
      const m = createVariantMatrix([variant]);
      const j = buildProductGroupJsonLd({
        title: 'X',
        currency: 'COP',
        variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price: '1.00', ...(availableForSale === undefined ? {} : { availableForSale }) }],
      });
      const matrixSaysBuyable = m.statusFor('Talla', '42') === VALUE_STATUS.AVAILABLE;
      const jsonldAvailability = j.hasVariant[0].offers.availability;

      if (availableForSale === true) {
        assert.equal(matrixSaysBuyable, true);
        assert.equal(jsonldAvailability, 'https://schema.org/InStock');
      } else if (availableForSale === false) {
        assert.equal(matrixSaysBuyable, false);
        assert.equal(jsonldAvailability, 'https://schema.org/OutOfStock');
      } else {
        assert.equal(matrixSaysBuyable, false);
        assert.equal(jsonldAvailability, undefined); // sin dato, no se declara
      }
    }
  });
});

describe('HALLAZGO 3 — la costura entre size-advisor y variant-matrix era implícita', () => {
  const CHART = [
    { label: '42', footLengthCm: 26.6 },
    { label: '43', footLengthCm: 27.3 },
  ];

  test('purchasableValuesFor da exactamente lo que espera reconcileWithStock', () => {
    const m = createVariantMatrix(VARIANTS);
    const buyables = m.purchasableValuesFor('Talla', { Color: 'Negro' });
    assert.deepEqual(buyables, ['42']); // la 43 está agotada

    const rec = recommendSize(27.3, CHART); // recomienda la 43
    assert.equal(rec.label, '43');

    const final = reconcileWithStock(rec, buyables, CHART);
    assert.equal(final.substituted, true);
    assert.equal(final.label, '42');
  });

  test('purchasableValuesFor excluye agotadas e inexistentes por igual', () => {
    const m = createVariantMatrix(VARIANTS);
    assert.deepEqual(m.purchasableValuesFor('Talla', { Color: 'Café' }), ['42']);
  });

  test('sin nada comprable devuelve lista vacía, no null', () => {
    const m = createVariantMatrix(
      VARIANTS.map((v) => ({ ...v, availableForSale: false })),
    );
    assert.deepEqual(m.purchasableValuesFor('Talla'), []);
  });

  test('una opción desconocida devuelve lista vacía sin lanzar', () => {
    const m = createVariantMatrix(VARIANTS);
    assert.deepEqual(m.purchasableValuesFor('Inventada'), []);
  });

  test('el cruce tolera diferencias de espacios y caja en las etiquetas', () => {
    const rec = recommendSize(26.6, [{ label: ' 42 ', footLengthCm: 26.6 }]);
    const out = reconcileWithStock(rec, ['42'], [{ label: ' 42 ', footLengthCm: 26.6 }]);
    assert.equal(out.substituted, false);
  });
});

describe('HALLAZGO 4 — el ancho sobrescribía la talla en los datos estructurados', () => {
  /**
   * Antes: `{ Talla: '42', Ancho: 'D' }` emitía `size: "D"`. Se publicaba un
   * dato falso ante el buscador: variesBy decía size y el valor era el ancho.
   */
  test('con el mapa por defecto, "ancho" se omite y la talla sobrevive', () => {
    const j = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }, { name: 'Ancho', value: 'D' }], price: '1.00', availableForSale: true }],
    });
    assert.equal(j.hasVariant[0].size, '42');
    assert.deepEqual(j.variesBy, [VARIES_BY.SIZE]);
    assert.deepEqual(collisionsIn(j), []); // no hay colisión: ancho no está mapeado
  });

  test('un mapa explícito que colisiona no pierde la primera propiedad, y lo declara', () => {
    const j = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      optionMap: { ancho: { variesBy: VARIES_BY.SIZE, property: 'size' } },
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }, { name: 'Ancho', value: 'D' }], price: '1.00', availableForSale: true }],
    });
    assert.equal(j.hasVariant[0].size, '42'); // gana la primera por orden
    assert.deepEqual(collisionsIn(j), ['Ancho -> size']);
  });

  test('las colisiones no contaminan el JSON-LD serializado', () => {
    const j = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      optionMap: { ancho: { variesBy: VARIES_BY.SIZE, property: 'size' } },
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }, { name: 'Ancho', value: 'D' }], price: '1.00', availableForSale: true }],
    });
    assert.equal(JSON.stringify(j).includes('__collisions'), false);
  });

  test('collisionsIn tolera entrada defectuosa', () => {
    assert.deepEqual(collisionsIn(null), []);
    assert.deepEqual(collisionsIn(undefined), []);
    assert.deepEqual(collisionsIn({}), []);
  });

  test('propiedades distintas no se consideran colisión', () => {
    const j = buildProductGroupJsonLd({
      title: 'X',
      currency: 'COP',
      variants: [
        { selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }, { name: 'Material', value: 'Cuero' }], price: '1.00', availableForSale: true },
      ],
    });
    assert.deepEqual(collisionsIn(j), []);
    assert.equal(j.variesBy.length, 3);
  });
});

describe('foldKey — una sola normalización para todos los módulos', () => {
  test('pliega acentos, caja y espacios', () => {
    assert.equal(foldKey(' Café '), 'cafe');
    assert.equal(foldKey('TALLA'), 'talla');
    assert.equal(foldKey('Ñandú'), 'nandu');
  });

  test('tolera null, undefined y no-cadenas', () => {
    assert.equal(foldKey(null), '');
    assert.equal(foldKey(undefined), '');
    assert.equal(foldKey(42), '42');
  });
});

describe('SEGURIDAD — endurecimiento tras la sonda de auditoría', () => {
  test('S1 · un dato de producto no puede cerrar la etiqueta script', () => {
    const out = serializeJsonLd(
      buildProductGroupJsonLd({ title: 'x</script><img src=x onerror=alert(1)>' }),
    );
    assert.equal(out.includes('</script>'), false);
    assert.equal(out.includes('<img'), false);
  });

  test('S2 · los separadores de línea Unicode se escapan', () => {
    const out = serializeJsonLd(buildProductGroupJsonLd({ title: 'a b c' }));
    assert.equal(out.includes(' '), false);
    assert.equal(out.includes(' '), false);
    assert.equal(out.includes('\\u2028'), true);
    // Y sigue siendo JSON válido con el contenido intacto.
    assert.equal(JSON.parse(out).name, 'a b c');
  });

  test('S3 · un optionMap con __proto__ no contamina nada y se rechaza', () => {
    const j = buildProductGroupJsonLd({
      title: 'x',
      currency: 'COP',
      optionMap: { talla: { variesBy: VARIES_BY.SIZE, property: '__proto__' } },
      variants: [{ selectedOptions: [{ name: 'Talla', value: 'inyectado' }], price: '1.00', availableForSale: true }],
    });
    assert.equal({}.inyectado, undefined);
    assert.equal(Object.getPrototypeOf(j.hasVariant[0]), Object.prototype);
    assert.deepEqual(rejectedIn(j), ['Talla -> __proto__']);
  });

  test('S4 · "constructor" no se escribe en el grafo', () => {
    const j = buildProductGroupJsonLd({
      title: 'x',
      currency: 'COP',
      optionMap: { talla: { variesBy: VARIES_BY.SIZE, property: 'constructor' } },
      variants: [{ selectedOptions: [{ name: 'Talla', value: 'X' }], price: '1.00', availableForSale: true }],
    });
    assert.equal(Object.prototype.hasOwnProperty.call(j.hasVariant[0], 'constructor'), false);
    assert.deepEqual(rejectedIn(j), ['Talla -> constructor']);
  });

  test('S4b · tampoco se permiten las claves del propio JSON-LD', () => {
    for (const property of ['@type', '@context', '@id', 'prototype', '1bad', 'con-guion', '']) {
      const j = buildProductGroupJsonLd({
        title: 'x',
        currency: 'COP',
        optionMap: { talla: { variesBy: VARIES_BY.SIZE, property } },
        variants: [{ selectedOptions: [{ name: 'Talla', value: 'X' }], price: '1.00', availableForSale: true }],
      });
      assert.equal(j.hasVariant[0]['@type'], 'Product', `${property} alteró @type`);
      assert.equal(rejectedIn(j).length, 1, `${property} debió rechazarse`);
    }
  });

  test('S5 · variant-matrix no se contamina con __proto__ como nombre de opción', () => {
    const m = createVariantMatrix([
      {
        id: '1',
        selectedOptions: [{ name: '__proto__', value: 'x' }, { name: 'Talla', value: '42' }],
        availableForSale: true,
      },
    ]);
    assert.equal({}.x, undefined);
    assert.equal(m.resolve({ __proto__: 'x', Talla: '42' })?.id, '1');
  });

  test('S6 · un precio malformado no se emite', () => {
    for (const price of ['00042', '1e9', '+1.00', '-1.00', '1.', '.5', ' 1 . 0 ', '1,00']) {
      const j = buildProductGroupJsonLd({
        title: 'x',
        currency: 'COP',
        variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price, availableForSale: true }],
      });
      assert.equal(j.hasVariant[0].offers, undefined, `emitió oferta con ${JSON.stringify(price)}`);
    }
  });

  test('S6b · los precios bien formados siguen pasando', () => {
    for (const price of ['0', '0.5', '1', '1.00', '100000.50', 79999]) {
      const j = buildProductGroupJsonLd({
        title: 'x',
        currency: 'COP',
        variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price, availableForSale: true }],
      });
      assert.ok(j.hasVariant[0].offers, `rechazó ${JSON.stringify(price)}`);
    }
  });

  test('S7 · una moneda malformada impide la oferta en lugar de emitirse', () => {
    for (const currency of ['COP"><script>', 'PESOS', 'CO', '', '123', 'C0P']) {
      const j = buildProductGroupJsonLd({
        title: 'x',
        currency,
        variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price: '1.00', availableForSale: true }],
      });
      assert.equal(j.hasVariant[0].offers, undefined, `aceptó ${JSON.stringify(currency)}`);
    }
  });

  test('S7b · una moneda válida en minúscula se normaliza a mayúscula', () => {
    const j = buildProductGroupJsonLd({
      title: 'x',
      currency: 'cop',
      variants: [{ selectedOptions: [{ name: 'Talla', value: '42' }], price: '1.00', availableForSale: true }],
    });
    assert.equal(j.hasVariant[0].offers.priceCurrency, 'COP');
  });

  test('ni __collisions ni __rejected aparecen en el JSON serializado', () => {
    const j = buildProductGroupJsonLd({
      title: 'x',
      currency: 'COP',
      optionMap: { talla: { variesBy: VARIES_BY.SIZE, property: 'constructor' } },
      variants: [{ selectedOptions: [{ name: 'Talla', value: 'X' }, { name: 'Color', value: 'Negro' }], price: '1.00', availableForSale: true }],
    });
    const out = serializeJsonLd(j);
    assert.equal(out.includes('__rejected'), false);
    assert.equal(out.includes('__collisions'), false);
  });
});

describe('HALLAZGO 5 — un parámetro por defecto no cubre null', () => {
  /**
   * Defecto real, encontrado barriendo todas las funciones exportadas con null en
   * cada posición de argumento. `function f(opts = {})` solo aplica el valor por
   * defecto cuando el argumento es `undefined`; con `null` entra como null y la
   * primera lectura de propiedad lanza.
   *
   * Afectaba a seis funciones de cinco módulos. §216 exige degradar, no lanzar, y
   * un `null` llega solo en cuanto una interfaz pasa una variable sin inicializar.
   */
  test('ninguna función exportada lanza con null o undefined en ninguna posición', async () => {
    const modulos = [
      'variant-matrix', 'size-advisor', 'product-jsonld', 'analytics-taxonomy',
      'shopify-semantics', 'product-contract', 'shopify-adapter',
      'size-selected-event', 'cart-line', 'cod-guard', 'responsive-image',
    ];
    const fallos = [];
    for (const nombre of modulos) {
      const mod = await import(`../${nombre}.js`);
      for (const [clave, fn] of Object.entries(mod)) {
        if (typeof fn !== 'function') continue;
        for (const args of [[null], [undefined], [{}, null], [null, null], [null, null, null]]) {
          try {
            fn(...args);
          } catch (error) {
            fallos.push(`${nombre}.${clave}(${args.map(String).join(', ')}): ${error.message}`);
          }
        }
      }
    }
    assert.deepEqual(fallos, []);
  });
});
