import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createVariantMatrix, VALUE_STATUS } from '../variant-matrix.js';

/**
 * Esta fábrica reproduce EXACTAMENTE la matriz que se verificó contra Shopify
 * en docs/VERIFICATION-LOG.md §4: tres colores, cuatro tallas, y el tercer color
 * existiendo solo en dos de las cuatro tallas.
 *
 * Es el caso que hace fallar a un selector que se fíe de `hasVariants`.
 */
function footwearFixture({ availability = {} } = {}) {
  const combos = [
    ['Negro', '39'], ['Negro', '40'], ['Negro', '41'], ['Negro', '42'],
    ['Arena', '39'], ['Arena', '40'], ['Arena', '41'], ['Arena', '42'],
    ['Oliva', '39'], ['Oliva', '42'], // <- matriz incompleta, a propósito
  ];
  return combos.map(([color, talla], i) => {
    const key = `${color}/${talla}`;
    return {
      id: `gid://shopify/ProductVariant/${1000 + i}`,
      selectedOptions: [
        { name: 'Color', value: color },
        { name: 'Talla', value: talla },
      ],
      availableForSale: key in availability ? availability[key] : true,
    };
  });
}

describe('createVariantMatrix — estructura', () => {
  test('deduce el orden de opciones del orden de aparición', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.deepEqual([...m.optionNames], ['Color', 'Talla']);
  });

  test('lista los valores sin duplicar y en orden de aparición', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.deepEqual([...m.options[0].values], ['Negro', 'Arena', 'Oliva']);
    assert.deepEqual([...m.options[1].values], ['39', '40', '41', '42']);
  });

  test('cuenta las combinaciones reales, no el producto cartesiano', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.equal(m.variantCount, 10); // 3x4 = 12 serían si la matriz fuera completa
  });
});

describe('createVariantMatrix — el fallo que previene', () => {
  test('una talla que no existe para el color elegido es NONEXISTENT, no agotada', () => {
    const m = createVariantMatrix(footwearFixture());
    // Oliva solo existe en 39 y 42.
    assert.equal(m.statusFor('Talla', '40', { Color: 'Oliva' }), VALUE_STATUS.NONEXISTENT);
    assert.equal(m.statusFor('Talla', '41', { Color: 'Oliva' }), VALUE_STATUS.NONEXISTENT);
    assert.equal(m.statusFor('Talla', '39', { Color: 'Oliva' }), VALUE_STATUS.AVAILABLE);
    assert.equal(m.statusFor('Talla', '42', { Color: 'Oliva' }), VALUE_STATUS.AVAILABLE);
  });

  test('distingue agotado de inexistente, que es el punto de todo esto', () => {
    const m = createVariantMatrix(
      footwearFixture({ availability: { 'Negro/41': false } }),
    );
    assert.equal(m.statusFor('Talla', '41', { Color: 'Negro' }), VALUE_STATUS.UNAVAILABLE);
    assert.equal(m.statusFor('Talla', '41', { Color: 'Oliva' }), VALUE_STATUS.NONEXISTENT);
  });

  test('sin selección, un valor está disponible si existe en alguna combinación comprable', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.equal(m.statusFor('Talla', '40', {}), VALUE_STATUS.AVAILABLE);
    assert.equal(m.statusFor('Color', 'Oliva', {}), VALUE_STATUS.AVAILABLE);
  });

  test('el valor evaluado sustituye al ya elegido de su propia opción', () => {
    const m = createVariantMatrix(footwearFixture());
    // Con la 41 elegida, Oliva no debe aparecer como comprable...
    assert.equal(m.statusFor('Color', 'Oliva', { Talla: '41' }), VALUE_STATUS.NONEXISTENT);
    // ...pero evaluar la talla 42 teniendo la 41 elegida sí debe funcionar.
    assert.equal(m.statusFor('Talla', '42', { Talla: '41' }), VALUE_STATUS.AVAILABLE);
  });
});

describe('createVariantMatrix — statusesFor', () => {
  test('devuelve el estado de todos los valores de una opción', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.deepEqual(m.statusesFor('Talla', { Color: 'Oliva' }), [
      { value: '39', status: 'available' },
      { value: '40', status: 'nonexistent' },
      { value: '41', status: 'nonexistent' },
      { value: '42', status: 'available' },
    ]);
  });
});

describe('createVariantMatrix — resolve', () => {
  test('resuelve una selección completa', () => {
    const m = createVariantMatrix(footwearFixture());
    const v = m.resolve({ Color: 'Arena', Talla: '40' });
    assert.ok(v);
    assert.equal(v.selectedOptions[0].value, 'Arena');
  });

  test('una selección incompleta no resuelve', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.equal(m.resolve({ Color: 'Arena' }), null);
  });

  test('una combinación inexistente no resuelve', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.equal(m.resolve({ Color: 'Oliva', Talla: '40' }), null);
  });

  test('tolera diferencias de caja y espacios', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.ok(m.resolve({ Color: ' arena ', Talla: '40' }));
  });
});

describe('createVariantMatrix — estado inicial', () => {
  test('firstAvailableSelection evita aterrizar en agotado', () => {
    const m = createVariantMatrix(
      footwearFixture({
        availability: {
          'Negro/39': false, 'Negro/40': false, 'Negro/41': false, 'Negro/42': false,
          'Arena/39': false,
        },
      }),
    );
    const sel = m.firstAvailableSelection();
    assert.ok(sel);
    const v = m.resolve(sel);
    assert.equal(v.availableForSale, true);
  });

  test('si nada es comprable, devuelve null en lugar de mentir', () => {
    const all = footwearFixture().map((v) => ({ ...v, availableForSale: false }));
    const m = createVariantMatrix(all);
    assert.equal(m.firstAvailableSelection(), null);
  });
});

describe('createVariantMatrix — reconcile', () => {
  test('cambiar a un color que no tiene la talla elegida suelta la talla, no el color', () => {
    const m = createVariantMatrix(footwearFixture());
    const next = m.reconcile({ Color: 'Oliva', Talla: '41' }, 'Color');
    assert.equal(next.Color, 'Oliva');
    assert.equal(next.Talla, undefined);
  });

  test('una selección válida se deja intacta', () => {
    const m = createVariantMatrix(footwearFixture());
    const next = m.reconcile({ Color: 'Negro', Talla: '41' }, 'Color');
    assert.deepEqual(next, { Color: 'Negro', Talla: '41' });
  });

  test('cambiar la talla a una que el color no tiene suelta el color', () => {
    const m = createVariantMatrix(footwearFixture());
    const next = m.reconcile({ Color: 'Oliva', Talla: '41' }, 'Talla');
    assert.equal(next.Talla, '41');
    assert.equal(next.Color, undefined);
  });
});

describe('createVariantMatrix — entrada defectuosa (§216)', () => {
  test('lista vacía no explota', () => {
    const m = createVariantMatrix([]);
    assert.equal(m.variantCount, 0);
    assert.deepEqual([...m.optionNames], []);
    assert.equal(m.resolve({}), null);
    assert.equal(m.firstAvailableSelection(), null);
    assert.deepEqual(m.statusesFor('Talla'), []);
  });

  test('null y undefined no explotan', () => {
    assert.equal(createVariantMatrix(null).variantCount, 0);
    assert.equal(createVariantMatrix(undefined).variantCount, 0);
  });

  test('variantes malformadas se ignoran sin romper el resto', () => {
    const m = createVariantMatrix([
      null,
      { id: 'a' },
      { id: 'b', selectedOptions: [] },
      {
        id: 'c',
        selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }],
        availableForSale: true,
      },
    ]);
    assert.equal(m.variantCount, 1);
    assert.ok(m.resolve({ Color: 'Negro', Talla: '42' }));
  });

  test('una opción desconocida da NONEXISTENT en lugar de lanzar', () => {
    const m = createVariantMatrix(footwearFixture());
    assert.equal(m.statusFor('Material', 'Cuero', {}), VALUE_STATUS.NONEXISTENT);
  });

  test('una variante que no cubre todas las opciones se descarta', () => {
    const m = createVariantMatrix([
      {
        id: 'completa',
        selectedOptions: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }],
        availableForSale: true,
      },
      { id: 'parcial', selectedOptions: [{ name: 'Color', value: 'Arena' }], availableForSale: true },
    ]);
    assert.equal(m.variantCount, 1);
  });

  test('ante combinación duplicada gana la comprable', () => {
    const base = [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: '42' }];
    const m = createVariantMatrix([
      { id: 'agotada', selectedOptions: base, availableForSale: false },
      { id: 'comprable', selectedOptions: base, availableForSale: true },
    ]);
    assert.equal(m.resolve({ Color: 'Negro', Talla: '42' }).id, 'comprable');
  });
});

describe('createVariantMatrix — producto de una sola opción', () => {
  test('funciona con una única opción', () => {
    const m = createVariantMatrix([
      { id: '1', selectedOptions: [{ name: 'Talla', value: '41' }], availableForSale: true },
      { id: '2', selectedOptions: [{ name: 'Talla', value: '42' }], availableForSale: false },
    ]);
    assert.equal(m.statusFor('Talla', '41'), VALUE_STATUS.AVAILABLE);
    assert.equal(m.statusFor('Talla', '42'), VALUE_STATUS.UNAVAILABLE);
    assert.equal(m.statusFor('Talla', '43'), VALUE_STATUS.NONEXISTENT);
  });
});

describe('createVariantMatrix — tres opciones (límite de Shopify)', () => {
  test('soporta el máximo de 3 opciones que permite la plataforma', () => {
    const m = createVariantMatrix([
      {
        id: '1',
        selectedOptions: [
          { name: 'Color', value: 'Negro' },
          { name: 'Talla', value: '42' },
          { name: 'Ancho', value: 'D' },
        ],
        availableForSale: true,
      },
      {
        id: '2',
        selectedOptions: [
          { name: 'Color', value: 'Negro' },
          { name: 'Talla', value: '42' },
          { name: 'Ancho', value: '2E' },
        ],
        availableForSale: false,
      },
    ]);
    assert.equal(m.optionNames.length, 3);
    assert.equal(m.statusFor('Ancho', 'D', { Color: 'Negro', Talla: '42' }), VALUE_STATUS.AVAILABLE);
    assert.equal(m.statusFor('Ancho', '2E', { Color: 'Negro', Talla: '42' }), VALUE_STATUS.UNAVAILABLE);
  });
});
