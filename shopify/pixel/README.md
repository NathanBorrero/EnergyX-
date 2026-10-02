# Pixel personalizado — Nathan & Esteban

## Qué es

`custom-pixel.js` es el cuerpo de un **pixel personalizado** de Shopify. Es una capacidad
**nativa**: no hace falta crear una app, ni una extensión, ni infraestructura propia. Shopify lo
ejecuta en un sandbox aislado del resto de la página.

## Cómo se instala

1. Shopify admin → **Settings** → **Customer events**
2. **Add custom pixel** → ponle un nombre (p. ej. `Nathan & Esteban — embudo`)
3. Pega el contenido completo de `custom-pixel.js`
4. **Save**, y después **Connect**

El permiso de datos del cliente que pida Shopify al conectarlo debe ser el de **Analytics**, no
el de Marketing: este pixel no hace publicidad, mide el embudo.

## Por qué existe

La lista exhaustiva de eventos estándar de pixel **no incluye ninguno de selección de variante**.
Verificado contra la documentación: los quince eventos estándar cubren vistas, carrito, búsqueda y
checkout, y ninguno dice qué talla miró el comprador.

En calzado eso es el dato que decide producción y devoluciones, así que el theme publica un evento
propio, `ne:size_selected`, y este pixel lo recoge.

## Las tres reglas que lo gobiernan

### 1. Consentimiento

Nada sale del pixel sin `analyticsProcessingAllowed`. Se consulta el estado inicial con
`init.customerPrivacy` y se escucha `visitorConsentCollected`, porque **el comprador puede aceptar
después de cargar la página**: sin esa suscripción, toda la sesión quedaría medida con el estado
inicial.

Por eso el theme **no** usa los eventos estándar de storefront para analítica: esos se disparan al
margen del consentimiento.

### 2. Ningún dato de cliente sostiene una cifra de negocio

Este pixel mide **intención**: qué se vio, qué talla se probó, qué se añadió, qué checkout se
inició. Nada más.

| Lo que NO mide | De dónde sale |
| --- | --- |
| Pedidos | webhook `orders/create` — y con contra entrega **no es una venta**: todavía no ha entrado dinero |
| Ingresos | webhook `orders/paid` — primer punto con ingreso real |
| Envíos | webhooks `fulfillments/create`, `orders/fulfilled` |
| Entregas | `fulfillments/update`, y depende de la transportadora |
| Devoluciones / RTO | no es un concepto nativo de Shopify |

El pixel tiene `checkout_completed` disponible y **no se usa a propósito**: señalaría lo mismo que
`orders/create` pero sujeto a consentimiento y a bloqueadores, así que daría una cifra **menor**.
Dos números para el mismo hecho es cómo se construye un informe que miente. La comprobación
`el pixel usa el vocabulario de la taxonomía y no envía dinero` lo impide.

### 3. El evento propio es entrada no confiable

Shopify documenta que un visitante puede publicar eventos personalizados **desde la consola del
navegador**. Así que `ne:size_selected` se trata como entrada hostil: el estado se valida contra la
lista cerrada que el theme puede emitir, las cadenas se recortan, y el payload viaja marcado con
`trusted: false`.

Esa marca es lo que permite que un informe no cuente el dato como un hecho. Sirve para decidir qué
tallas producir; no para una cifra.

## Destino: PLACEHOLDER

No hay servicio de analítica definido para este proyecto, así que **no se inventa ninguno**. Con
`DESTINATION` vacío el pixel **no hace ninguna petición de red**: normaliza los eventos y los deja
en un buffer local inspeccionable (`__neAnalytics.buffer`).

Apuntarlo a un endpoint inexistente sería fingir una integración.

**Para activarlo:** poner la URL del recolector en `DESTINATION` y volver a guardar el pixel. Nada
más cambia.

## Qué se comprueba automáticamente

`node scripts/check-theme.mjs` verifica, y cada comprobación se validó inyectando su fallo:

| Comprobación | Fallo que detecta |
| --- | --- |
| Vocabulario compartido | una etapa que no existe en `src/lib/analytics-taxonomy.js` |
| Etapas de servidor | contar pedidos desde el navegador |
| Sin dinero | cualquier campo de importe en el payload |
| Sin `checkout_completed` | duplicar `orders/create` con una cifra menor |
| Consentimiento | no comprobar `analyticsProcessingAllowed` |
| Aceptación posterior | no escuchar `visitorConsentCollected` |
| Confianza marcada | no distinguir el dato manipulable |

El vocabulario está repetido en el pixel porque un pixel personalizado **no puede importar
módulos**: es un script suelto en un sandbox. La repetición es inevitable; la deriva no.

## Lo que falta, y de qué depende

| Pendiente | Depende de |
| --- | --- |
| Destino real de los eventos | decisión del dueño sobre servicio de analítica |
| Los webhooks de pedido | una app o un endpoint con sus credenciales |
| Confirmar `fulfillments/update` como señal de entrega | datos reales de transportadora |
| Determinar cómo se ve un RTO en los datos | pedidos reales |
