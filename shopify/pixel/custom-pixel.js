/**
 * NATHAN & ESTEBAN — pixel personalizado de Shopify.
 *
 * QUÉ ES Y DÓNDE VA
 *
 * Esto NO es un archivo del theme y NO se importa desde ningún sitio. Es el
 * cuerpo de un «pixel personalizado» de Shopify, que se pega en:
 *
 *   Shopify admin -> Settings -> Customer events -> Add custom pixel
 *
 * Es una capacidad NATIVA de Shopify: no hace falta crear una app, ni una
 * extensión, ni infraestructura. Shopify lo ejecuta en un sandbox aislado del
 * resto de la página.
 *
 * POR QUÉ EXISTE
 *
 * Porque la lista exhaustiva de eventos estándar de pixel NO incluye ninguno de
 * selección de variante. Verificado: `alert_displayed`, `cart_viewed`,
 * `checkout_address_info_submitted`, `checkout_completed`,
 * `checkout_contact_info_submitted`, `checkout_shipping_info_submitted`,
 * `checkout_started`, `collection_viewed`, `page_viewed`,
 * `payment_info_submitted`, `product_added_to_cart`, `product_removed_from_cart`,
 * `product_viewed`, `search_submitted`, `ui_extension_errored`. Ninguno dice qué
 * talla miró el comprador.
 *
 * En calzado eso es justo el dato que importa, así que el theme publica un
 * evento propio —`ne:size_selected`— y aquí se recoge.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN
 *
 * 1. CONSENTIMIENTO. Nada sale de aquí sin `analyticsProcessingAllowed`. Se
 *    consulta el estado inicial y se escuchan los cambios, porque el comprador
 *    puede aceptar después de cargar la página.
 *
 * 2. NINGÚN DATO DE CLIENTE SOSTIENE UNA CIFRA DE NEGOCIO. Esto mide intención
 *    —qué se miró, qué talla se probó, qué se añadió—, y nada más. Ventas,
 *    ingresos, stock, entregas y devoluciones vienen de los webhooks de pedido,
 *    que son de servidor y no dependen del consentimiento ni de un bloqueador.
 *    Mezclar las dos fuentes en un informe produce un informe que miente.
 *
 * 3. EL EVENTO PROPIO ES ENTRADA NO CONFIABLE. Shopify documenta que un
 *    visitante puede publicar eventos personalizados desde la consola del
 *    navegador. Así que se valida y se recorta como cualquier entrada hostil, y
 *    se marca en el payload con `trusted: false`.
 *
 * DESTINO: PLACEHOLDER
 *
 * No hay servicio de analítica definido para este proyecto, así que no se
 * inventa ninguno. Con `DESTINATION` vacío el pixel NO ENVÍA NADA: normaliza los
 * eventos y los deja en un buffer local que se puede inspeccionar desde la
 * consola. Apuntarlo a un endpoint inexistente sería fingir una integración.
 *
 * Para activarlo: poner en `DESTINATION` la URL del recolector y desplegarlo de
 * nuevo. Nada más cambia.
 */

/* eslint-disable no-undef -- `analytics`, `init`, `api` y `browser` los inyecta
   el sandbox de Shopify; no son importables. */

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/**
 * URL del recolector de eventos.
 *
 * PLACEHOLDER DELIBERADO. Vacío = el pixel no hace ninguna petición de red.
 * Ver «DESTINO: PLACEHOLDER» arriba.
 */
const DESTINATION = '';

/** Prefijo de los eventos propios del proyecto. */
const OWN_PREFIX = 'ne:';

/**
 * Etapas del embudo, en el mismo vocabulario que `src/lib/analytics-taxonomy.js`.
 *
 * Están repetidas aquí porque un pixel personalizado es un script suelto en un
 * sandbox: no puede importar módulos. La repetición está vigilada por la
 * comprobación `el pixel usa el vocabulario de la taxonomía`, que falla si esta
 * lista y la del módulo se separan.
 */
const STAGE = {
  SESSION: 'session',
  PRODUCT_VIEWED: 'product_viewed',
  SIZE_SELECTED: 'size_selected',
  ADDED_TO_CART: 'added_to_cart',
  CHECKOUT_STARTED: 'checkout_started',
};

/** Evento estándar de Shopify -> etapa del embudo. */
const STAGE_BY_EVENT = {
  page_viewed: STAGE.SESSION,
  product_viewed: STAGE.PRODUCT_VIEWED,
  product_added_to_cart: STAGE.ADDED_TO_CART,
  checkout_started: STAGE.CHECKOUT_STARTED,
};

/**
 * Etapas que NO se miden aquí, y por qué. Se deja escrito para que nadie las
 * añada por descuido:
 *
 *   order_created    webhook `orders/create`  — y con contra entrega NO es una
 *                    venta: todavía no ha entrado dinero.
 *   order_confirmed  webhook `orders/paid`    — primer punto con ingreso real.
 *   order_shipped    webhooks de fulfillment.
 *   order_delivered  depende de la transportadora.
 *   order_returned   no es un concepto nativo de Shopify.
 *
 * El pixel tiene `checkout_completed` disponible y NO se usa: señalaría lo mismo
 * que `orders/create` pero sujeto a consentimiento y a bloqueadores, así que
 * daría una cifra menor. Dos números para el mismo hecho es cómo se construye un
 * informe que miente.
 */

/** Longitud máxima de cualquier cadena que se reenvíe. */
const MAX_FIELD = 200;

// ---------------------------------------------------------------------------
// Consentimiento
// ---------------------------------------------------------------------------

let privacy = init && init.customerPrivacy ? init.customerPrivacy : null;

try {
  // El comprador puede aceptar DESPUÉS de cargar la página, sin recargarla. Sin
  // esta suscripción, toda la sesión quedaría medida con el estado inicial.
  api.customerPrivacy.subscribe('visitorConsentCollected', (event) => {
    privacy = event && event.customerPrivacy ? event.customerPrivacy : privacy;
  });
} catch (error) {
  // Si la API no está disponible, se queda el estado inicial. No se asume
  // consentimiento: `allowed()` devuelve false ante la duda.
  privacy = privacy || null;
}

/** @returns {boolean} ¿Se puede procesar analítica ahora mismo? */
function allowed() {
  return Boolean(privacy && privacy.analyticsProcessingAllowed === true);
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/**
 * Recorta una cadena, o devuelve undefined si no hay nada utilizable.
 * @param {unknown} value
 * @returns {string|undefined}
 */
function field(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length > MAX_FIELD ? trimmed.slice(0, MAX_FIELD) : trimmed;
}

/**
 * Lo que se envía por cada evento.
 *
 * Deliberadamente pobre: identificadores, etapa y marca de tiempo. SIN DINERO y
 * sin nada que identifique a una persona. No se incluye precio ni total aunque
 * el evento los traiga, porque tenerlos invita a sumar ingresos desde el
 * cliente, y esa es la cifra falsa que todo esto intenta evitar.
 *
 * @param {string} stage
 * @param {object} extra
 * @param {boolean} trusted
 */
function envelope(stage, extra, trusted) {
  const payload = {
    stage,
    source: 'web_pixel',
    trusted,
    occurred_at: new Date().toISOString(),
  };
  for (const key of Object.keys(extra)) {
    const value = extra[key];
    if (typeof value === 'number' && Number.isFinite(value)) payload[key] = value;
    else if (typeof value === 'boolean') payload[key] = value;
    else {
      const clean = field(value);
      if (clean !== undefined) payload[key] = clean;
    }
  }
  return payload;
}

/**
 * Buffer local para cuando no hay destino configurado.
 *
 * No es un sustituto de un recolector: es la forma de poder comprobar que el
 * pixel funciona sin inventar un endpoint. Se inspecciona desde la consola con
 * `window.__neAnalytics` (en el sandbox, el objeto global del propio pixel).
 */
const buffer = [];
const LIMIT = 100;

/** @param {Record<string, unknown>} payload */
function send(payload) {
  if (!allowed()) return;

  buffer.push(payload);
  if (buffer.length > LIMIT) buffer.shift();

  if (DESTINATION === '') return; // PLACEHOLDER: sin destino no hay red.

  try {
    // `keepalive` para que el evento sobreviva a la navegación: sin esto, el
    // último evento antes de ir al checkout se pierde justo donde más importa.
    fetch(DESTINATION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* Un fallo de analítica no puede afectar a la tienda. */
    });
  } catch (error) {
    /* Igual. */
  }
}

try {
  globalThis.__neAnalytics = { buffer, allowed, get privacy() { return privacy; } };
} catch (error) {
  /* Si el sandbox no lo permite, el buffer sigue funcionando internamente. */
}

// ---------------------------------------------------------------------------
// Eventos estándar
// ---------------------------------------------------------------------------

analytics.subscribe('page_viewed', (event) => {
  send(envelope(STAGE.SESSION, { path: event?.context?.window?.location?.pathname }, true));
});

analytics.subscribe('product_viewed', (event) => {
  const variant = event?.data?.productVariant;
  send(
    envelope(
      STAGE.PRODUCT_VIEWED,
      {
        // Solo campos CONFIRMADOS en la forma del evento: `productVariant` trae
        // `id`, `sku`, `title` y `product`. No se usa `handle`: no se verificó
        // que el tipo `Product` del pixel lo exponga, y poner un campo que
        // podría llegar siempre vacío ensucia el dato sin añadir nada.
        product_id: variant?.product?.id,
        product_title: variant?.product?.title,
        variant_id: variant?.id,
        variant_title: variant?.title,
        sku: variant?.sku,
      },
      true,
    ),
  );
});

analytics.subscribe('product_added_to_cart', (event) => {
  const line = event?.data?.cartLine;
  send(
    envelope(
      STAGE.ADDED_TO_CART,
      {
        product_id: line?.merchandise?.product?.id,
        variant_id: line?.merchandise?.id,
        sku: line?.merchandise?.sku,
        variant_title: line?.merchandise?.title,
        quantity: line?.quantity,
      },
      true,
    ),
  );
});

analytics.subscribe('checkout_started', (event) => {
  const checkout = event?.data?.checkout;
  send(
    envelope(
      STAGE.CHECKOUT_STARTED,
      {
        // El token identifica el checkout y permite cruzarlo después con el
        // webhook del pedido, que es la fuente autoritativa. NO se envía ningún
        // importe: el ingreso lo dice `orders/paid`, no el cliente.
        checkout_token: checkout?.token,
        line_count: Array.isArray(checkout?.lineItems) ? checkout.lineItems.length : undefined,
      },
      true,
    ),
  );
});

// ---------------------------------------------------------------------------
// Evento propio: selección de talla
// ---------------------------------------------------------------------------

/**
 * `ne:size_selected`, publicado por el theme.
 *
 * ENTRADA NO CONFIABLE. Shopify documenta que un visitante puede publicar
 * eventos personalizados desde la consola del navegador, así que:
 *
 *   · se valida el estado contra la lista cerrada que el theme puede emitir,
 *   · se recortan todas las cadenas,
 *   · se marca `trusted: false` en el payload.
 *
 * Esa marca es lo que permite que un informe no cuente estos eventos como un
 * hecho. Mide intención y sirve para decidir qué tallas producir; no es una
 * cifra de negocio.
 */
const VALID_STATUS = { available: true, unavailable: true, nonexistent: true };

analytics.subscribe(`${OWN_PREFIX}size_selected`, (event) => {
  const data = event && event.customData ? event.customData : {};
  const status = field(data.status);

  send(
    envelope(
      STAGE.SIZE_SELECTED,
      {
        option_name: data.option_name,
        size: data.size,
        // Un estado que el theme no emite se descarta en lugar de reenviarse:
        // es el campo que más valor tiene —distingue «eligió su talla» de
        // «intentó una agotada»— y por eso es el que más interesa falsear.
        status: status && VALID_STATUS[status] ? status : undefined,
        product_id: data.product_id,
        product_handle: data.product_handle,
        variant_id: data.variant_id,
        ui_source: data.source,
      },
      false,
    ),
  );
});
