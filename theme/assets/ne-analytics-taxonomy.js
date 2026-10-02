/* generado desde src/lib/analytics-taxonomy.js — no editar, ver scripts/sync-theme-assets.mjs */
export const STAGE = Object.freeze({
  SESSION: 'session',
  PRODUCT_VIEWED: 'product_viewed',
  SIZE_SELECTED: 'size_selected',
  ADDED_TO_CART: 'added_to_cart',
  CHECKOUT_STARTED: 'checkout_started',
  ORDER_CREATED: 'order_created',
  ORDER_CONFIRMED: 'order_confirmed',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_RETURNED: 'order_returned',
});

export const STAGE_ORDER = Object.freeze([
  STAGE.SESSION,
  STAGE.PRODUCT_VIEWED,
  STAGE.SIZE_SELECTED,
  STAGE.ADDED_TO_CART,
  STAGE.CHECKOUT_STARTED,
  STAGE.ORDER_CREATED,
  STAGE.ORDER_CONFIRMED,
  STAGE.ORDER_SHIPPED,
  STAGE.ORDER_DELIVERED,
  STAGE.ORDER_RETURNED,
]);

export const SOURCE = Object.freeze({
  WEB_PIXEL: 'web_pixel',           // cliente, sujeto a consentimiento
  ADMIN_WEBHOOK: 'admin_webhook',   // servidor, autoritativo
  FULFILLMENT: 'fulfillment',       // servidor, depende de transportadora
  EXTERNAL: 'external',             // fuera de Shopify (p. ej. proveedor de fulfillment)
});

export const LEVEL = Object.freeze({
  VERIFICADO: 'VERIFICADO',
  DOCUMENTADO: 'DOCUMENTADO',
  NO_VERIFICADO: 'NO_VERIFICADO',
});

export const STAGE_META = Object.freeze({
  [STAGE.SESSION]: Object.freeze({
    label: 'Visita',
    source: SOURCE.WEB_PIXEL,
    consentGated: true,
    mechanism: 'web pixel — evento estándar `page_viewed`',
    level: LEVEL.VERIFICADO,
    note: 'Los eventos estándar de storefront NO sirven aquí: ignoran el consentimiento.',
  }),
  [STAGE.PRODUCT_VIEWED]: Object.freeze({
    label: 'Producto visto',
    source: SOURCE.WEB_PIXEL,
    consentGated: true,
    mechanism: 'web pixel — evento estándar `product_viewed`',
    level: LEVEL.VERIFICADO,
    note: null,
  }),
  [STAGE.SIZE_SELECTED]: Object.freeze({
    label: 'Talla seleccionada',
    source: SOURCE.WEB_PIXEL,
    consentGated: true,
    mechanism:
      'evento personalizado — `Shopify.analytics.publish(\'ne:size_selected\', data)` ' +
      'desde `theme.liquid` o un theme app extension, con `analytics.subscribe()` en el pixel',
    level: LEVEL.VERIFICADO,
    note:
      'La lista exhaustiva de eventos estándar de pixel NO incluye selección de ' +
      'variante, así que hace falta un evento propio. El mecanismo existe y está ' +
      'confirmado: `Shopify.analytics.publish` está disponible en el Online Store. ' +
      'Los nombres propios deben ir con prefijo para no colisionar con los ' +
      'estándar, que no se pueden publicar. ' +
      'SEGURIDAD: la documentación advierte que los eventos personalizados los ' +
      'puede publicar cualquiera, incluido un visitante desde la consola del ' +
      'navegador. El dato es entrada no confiable y no puede sostener una cifra.',
  }),
  [STAGE.ADDED_TO_CART]: Object.freeze({
    label: 'Añadido al carrito',
    source: SOURCE.WEB_PIXEL,
    consentGated: true,
    mechanism: 'web pixel — `product_added_to_cart`',
    level: LEVEL.VERIFICADO,
    note: null,
  }),
  [STAGE.CHECKOUT_STARTED]: Object.freeze({
    label: 'Checkout iniciado',
    source: SOURCE.WEB_PIXEL,
    consentGated: true,
    mechanism: 'web pixel — evento estándar `checkout_started`',
    level: LEVEL.VERIFICADO,
    note: 'Último punto medible en cliente: el checkout es de Shopify.',
  }),
  [STAGE.ORDER_CREATED]: Object.freeze({
    label: 'Pedido creado',
    source: SOURCE.ADMIN_WEBHOOK,
    consentGated: false,
    mechanism: 'webhook `orders/create` (ORDERS_CREATE)',
    level: LEVEL.VERIFICADO,
    note:
      'NO es una venta. Con contra entrega, aquí todavía no ha entrado dinero. ' +
      'Existe además el evento de pixel `checkout_completed`, que señala lo mismo ' +
      'desde el cliente, pero está sujeto a consentimiento y a bloqueadores, así ' +
      'que dará una cifra MENOR. Solo el webhook es autoritativo; si los dos ' +
      'números se mezclan en un informe, el informe miente.',
  }),
  [STAGE.ORDER_CONFIRMED]: Object.freeze({
    label: 'Pedido pagado',
    source: SOURCE.ADMIN_WEBHOOK,
    consentGated: false,
    mechanism: 'webhook `orders/paid` (ORDERS_PAID)',
    level: LEVEL.VERIFICADO,
    note:
      'Con contra entrega esto ocurre al cobrar en la entrega, no al hacer el ' +
      'pedido. Es el primer punto donde hay ingreso real.',
  }),
  [STAGE.ORDER_SHIPPED]: Object.freeze({
    label: 'Pedido enviado',
    source: SOURCE.FULFILLMENT,
    consentGated: false,
    mechanism: 'webhooks `fulfillments/create` y `orders/fulfilled`',
    level: LEVEL.VERIFICADO,
    note: null,
  }),
  [STAGE.ORDER_DELIVERED]: Object.freeze({
    label: 'Pedido entregado',
    source: SOURCE.FULFILLMENT,
    consentGated: false,
    mechanism: 'webhook `fulfillments/update`',
    level: LEVEL.NO_VERIFICADO,
    note:
      'El topic existe, pero que traiga un estado de entrega fiable depende de la ' +
      'transportadora. Con un proveedor de fulfillment externo la confirmación ' +
      'puede llegar por su lado y no por Shopify. Por verificar con datos reales.',
  }),
  [STAGE.ORDER_RETURNED]: Object.freeze({
    label: 'Devuelto / RTO',
    source: SOURCE.EXTERNAL,
    consentGated: false,
    mechanism: null,
    level: LEVEL.NO_VERIFICADO,
    note:
      'Un rechazo en la entrega no es un concepto nativo de Shopify. Puede ' +
      'aparecer como `orders/cancelled`, como `refunds/create`, como estado de ' +
      'fulfillment, o solo en el proveedor de fulfillment. Hay que determinarlo ' +
      'contra datos reales antes de construir el informe.',
  }),
});

export function consentGatedStages() {
  return STAGE_ORDER.filter((s) => STAGE_META[s].consentGated);
}

export function authoritativeStages() {
  return STAGE_ORDER.filter((s) => !STAGE_META[s].consentGated);
}

export function unverifiedStages() {
  return STAGE_ORDER.filter((s) => STAGE_META[s].level !== LEVEL.VERIFICADO);
}

function count(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

function rate(numerator, denominator) {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

export function funnelFrom(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};

  const counts = {};
  for (const stage of STAGE_ORDER) counts[stage] = count(input[stage]);

  const stepRates = {};
  const forward = STAGE_ORDER.filter((s) => s !== STAGE.ORDER_RETURNED);
  for (let i = 0; i < forward.length - 1; i += 1) {
    stepRates[`${forward[i]}_to_${forward[i + 1]}`] = rate(
      counts[forward[i + 1]],
      counts[forward[i]],
    );
  }

  const sessions = counts[STAGE.SESSION];
  const apparentConversion = rate(counts[STAGE.ORDER_CREATED], sessions);
  const paidConversion = rate(counts[STAGE.ORDER_CONFIRMED], sessions);
  const realConversion = rate(counts[STAGE.ORDER_DELIVERED], sessions);
  const rtoRate = rate(counts[STAGE.ORDER_RETURNED], counts[STAGE.ORDER_SHIPPED]);

  const overstatement =
    realConversion !== null && realConversion > 0 && apparentConversion !== null
      ? Math.round((apparentConversion / realConversion) * 100) / 100
      : null;

  const caveats = [];
  if (counts[STAGE.ORDER_DELIVERED] === 0 && counts[STAGE.ORDER_CREATED] > 0) {
    caveats.push(
      'Sin entregas registradas pero con pedidos creados: la conversión real no se ' +
        'puede afirmar. Puede ser falta de dato, no ausencia de ventas.',
    );
  }
  if (counts[STAGE.ORDER_CREATED] > 0 && counts[STAGE.ORDER_CONFIRMED] === 0) {
    caveats.push(
      'Pedidos creados sin ninguno pagado: esperado con contra entrega recién ' +
        'lanzada, o señal de que falta el webhook orders/paid.',
    );
  }
  if (counts[STAGE.SIZE_SELECTED] === 0 && counts[STAGE.PRODUCT_VIEWED] > 0) {
    caveats.push(
      'Sin selección de talla registrada: requiere un evento personalizado propio, ' +
        'así que probablemente falte instrumentarlo, no que nadie elija talla.',
    );
  }
  for (const stage of unverifiedStages()) {
    if (counts[stage] > 0) continue;
    caveats.push(`Etapa "${STAGE_META[stage].label}" sin mecanismo confirmado todavía.`);
  }

  return { counts, stepRates, apparentConversion, realConversion, paidConversion, rtoRate, overstatement, caveats };
}
