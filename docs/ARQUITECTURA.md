# Arquitectura de referencia — Sistema unificado Café + Hotel

**Versión:** 0.1 (base de desarrollo, no certificada para producción)

## Decisiones principales

- **PWA:** React + Vite + TypeScript. Responsive, compatible con QR, manifest y service worker. Menú navegable sin instalar desde tienda.
- **API:** Node + Express + TypeScript, autorización del lado del servidor. Staff conectado por Socket.IO. Seguimiento del cliente mediante token opaco y sondeo periódico de estados.
- **Persistencia:** PostgreSQL. Modelo relacional, transacciones atómicas e idempotencia en checkout. Montos en **COP enteros**; se convierten a centavos únicamente para Wompi.
- **Sesiones:** JWT en cookie `HttpOnly` y `SameSite=Lax` (Secure en producción). Carrito en localStorage; **no guardar JWT ni PIN** en almacenamiento web.
- **Exclusividad:** `visibility=standard` significa visible por todos; `visibility=guest` solo huésped. `area=cafe|hotel` es independiente de la categoría de presentación. No se confía en `area`, precios ni opciones enviadas por clientes.
- **PIN:** 4 dígitos generados con fuente criptográfica, Argon2id + pepper; vigencia limitada al checkout; cinco fallos bloquean 30 min; revocación inmediatamente invalidante. JWT de huésped máximo 2 horas y nunca más allá del check-out. Para mantener sesión más prolongada, implementar renovación limitada y revocable.
- **Roles staff:** admin, kitchen, cashier, reception, housekeeping. El rol guest se obtiene del PIN; standard navega sin sesión.
- **Inventario:** `is_available` apaga la venta sin borrar registros. Eliminación de producto es lógica, conservando historial en snapshots de la orden.

## Árbol del proyecto

```text
cafe-hotel-unificado/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── App.tsx                  # menú, carrito, huésped, paneles, CRM
│   │   │   ├── components/ProductForm.tsx  # alta/edición + opciones anidadas
│   │   │   ├── api.ts
│   │   │   ├── main.tsx
│   │   │   └── styles.css
│   │   ├── vite.config.ts               # PWA y proxy de desarrollo
│   │   └── public/icon.svg
│   └── api/
│       ├── sql/001_init.sql             # esquema PostgreSQL
│       ├── scripts/create-admin.ts
│       └── src/
│           ├── main.ts
│           ├── lib/{auth,db,events,notifications,validators,wompi}.ts
│           └── routes/{access,catalog,orders,operations,webhooks}.ts
├── docs/ARQUITECTURA.md
└── README.md
```

## Casos de uso y vistas

1. **QR:** URL `https://tu-dominio/?mesa=M12`; carga catálogo estándar y guarda carrito. El código de mesa es una indicación, **no** una identidad autenticada; en producción conviene usar tokens firmados por mesa para impedir suplantación.
2. **Huésped:** introduce habitación y PIN; servidor comprueba estancia y bloqueo; recibe JWT en cookie. Catálogo muestra standard + guest.
3. **Carrito mixto:** checkout valida el rol, cada producto y disponibilidad, los grupos y opciones, recalcula precios y crea una orden raíz con una o dos subórdenes.
4. **Café efectivo:** `pending_payment` hasta que caja confirme; después `queued` para cocina. No se cocina sin cobrar.
5. **Café online:** `waiting_gateway` hasta webhook auténtico `APPROVED`, valor/moneda/referencia consistentes; entonces `queued`. No confiar en parámetro de retorno del navegador.
6. **Hotel:** `queued` inmediatamente. Servicios gratuitos no dependen del pago del café. Servicios de pago son `room_charge` con asiento en `room_charges`.
7. **Cocina:** `queued → preparing → ready → completed` con roles habilitados; `EVENT_ORDER_READY` se inserta en outbox.
8. **Hotel:** `queued → dispatched → completed`; `EVENT_AMENITY_DISPATCHED` se inserta en outbox.
9. **WhatsApp:** worker asíncrono procesa eventos **si** existe teléfono, consentimiento transaccional, token y plantilla aprobada; si no, el seguimiento de pedido queda disponible en PWA.
10. **Admin:** CRUD lógico del catálogo; grupos de modificadores reutilizables; CMS con subida firmada de imágenes, booleano disponibilidad y clientes por visitas completadas.

## Esquema de base de datos

La definición **ejecutable** está en `apps/api/sql/001_init.sql`. Las relaciones relevantes:

- `products 1—N product_modifier_groups N—1 modifier_groups 1—N modifier_options`.
- `rooms 1—N stays`, cada estancia contiene PIN hash, TTL, bloqueo y revocación.
- `orders 1—N suborders 1—N order_items`.
- `orders N—1 customers` para clientes que facilitan sus datos y `orders N—1 stays` para huéspedes.
- `suborders 1—N payment_attempts` para las operaciones con pasarela.
- `suborders 1—0/1 room_charges` para servicios cargados a una habitación.
- `suborders 1—N domain_events` con claves de evento únicas para notificaciones.

### Ejemplo payload del CMS

```json
{
  "name":"Hamburguesa Artesanal",
  "description":"Carne a la parrilla y pan artesanal",
  "category":"Alimentos",
  "area":"cafe",
  "visibility":"standard",
  "priceCop":25000,
  "isAvailable":true,
  "imageUrl":null,
  "groups":[
    {"name":"Término de la carne","minSelected":1,"maxSelected":1,
     "options":[
       {"name":"Medio","type":"preference","priceDeltaCop":0},
       {"name":"Tres cuartos","type":"preference","priceDeltaCop":0},
       {"name":"Bien asada","type":"preference","priceDeltaCop":0}]},
    {"name":"Extras","minSelected":0,"maxSelected":2,
     "options":[
       {"name":"Tocineta","type":"add","priceDeltaCop":4000},
       {"name":"Queso","type":"add","priceDeltaCop":3000},
       {"name":"Sin cebolla","type":"remove","priceDeltaCop":0}]}
  ]
}
```

Para reutilizar un grupo existente, enviar `{ "existingGroupId": "uuid-real" }` como elemento de `groups`; no editar globalmente un grupo compartido desde el formulario de un solo producto. La actualización reemplaza las asociaciones del producto, sin eliminar grupos compartidos.

### Ejemplo payload del checkout

```json
{
  "idempotencyKey":"a2e13660-25b9-4fc2-9457-af375aa91e31",
  "tableCode":"M12",
  "customer":{"name":"Ana","phone":"+573001234567","whatsappOptIn":true},
  "cafePayment":"online",
  "hotelPayment":"none",
  "items":[
    {"productId":"REEMPLAZAR_UUID","quantity":2,
     "optionIds":["REEMPLAZAR_UUID_OPCION"],"note":"Poca sal"}
  ]
}
```

El payload **no** incluye `price`, `area`, `subtotal` ni estado de pago: esos campos se determinan y validan exclusivamente en API. Para huéspedes `customer` es opcional, pero se requiere si desean WhatsApp; solo puede solicitarse tras consentimiento.

## Tabla de autorización

| Acción | Standard | Guest | Kitchen | Cashier | Reception | Housekeeping | Admin |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Ver menú público | Sí | Sí | Sí* | Sí* | Sí* | Sí* | Sí* |
| Ver menú exclusivo hotel | No | Sí | — | — | — | — | CMS |
| Crear orden de café | Sí | Sí | — | — | — | — | — |
| Solicitar servicio de habitación | No | Sí | — | — | — | — | — |
| Cocina/caja Kanban | No | No | Sí | Sí | No | No | Sí |
| Hotel Kanban | No | No | No | No | Sí | Sí | Sí |
| Registrar/revocar estancia | No | No | No | No | Sí | No | Sí |
| Modificar catálogo/consultar CRM | No | No | No | No | No | No | Sí |

*Los usuarios staff usan su propia vista; el catálogo público existe como endpoint.

## API implementada

- `POST /api/staff/login` — staff, password Argon2.
- `POST /api/auth/logout`, `GET /api/auth/session`.
- `POST /api/guest/access` — habitación + PIN; JWT en cookie.
- `POST /api/reception/stays` — alta de estancia y PIN de un solo vistazo.
- `POST /api/reception/stays/:id/revoke` — checkout anticipado y revocación.
- `GET /api/reception/rooms`, `POST /api/admin/rooms`.
- `GET /api/catalog` — catálogo filtrado por acceso.
- `GET|POST /api/admin/products`, `PUT|DELETE /api/admin/products/:id`.
- `PATCH /api/admin/products/:id/availability` — agotado/activo.
- `GET /api/admin/modifier-groups`, `POST /api/admin/uploads/product-image`.
- `POST /api/orders/checkout` — split routing transaccional + idempotencia.
- `GET /api/orders/:id/status?token=...` — seguimiento sin exponer PII.
- `GET /api/staff/kanban/:area`, `PATCH /api/staff/suborders/:id/status`.
- `POST /api/webhooks/wompi` — checksum Wompi SHA-256, monto, moneda, referencia, entorno e idempotencia.
- `GET /api/admin/customers` — visitas y ticket promedio de pedidos completados.

## Eventos y avisos

- `EVENT_CASH_PENDING`: solo alerta en la interfaz (la respuesta de checkout indica acudir a caja).
- `EVENT_ORDER_READY`: outbox; si existe consentimiento y configuración, plantilla WhatsApp `WHATSAPP_TEMPLATE_READY` (texto aprobado recomendado: «Tu pedido está listo, acércate a la barra»).
- `EVENT_AMENITY_DISPATCHED`: outbox; si existe teléfono/consentimiento de huésped, plantilla `WHATSAPP_TEMPLATE_DISPATCHED` (texto recomendado: «Recepción ha procesado tu solicitud, vamos en camino a tu habitación»).

No se envían mensajes promocionales; requerir consentimiento independiente para marketing. La lógica de notificación es reintentable (máximo 4 veces), por lo que los envíos se consideran **al menos una vez**: podrían duplicarse ante una caída entre el envío externo y el registro interno. Para producción, implementar trazabilidad de IDs del proveedor, conciliación y deduplicación cuando el proveedor lo permita.

## Pendientes antes de producción

1. Configuración verificada de comercio Wompi, webhook público HTTPS y pruebas sandbox de PSE y tarjetas. La integración genera parámetros seguros de Web Checkout; no incluye claves ni cuenta comercial.
2. Configuración de bucket S3 con política CORS y tamaño de archivos, CDN, análisis de tipo real, control de capacidad de almacenamiento y limpieza de imágenes huérfanas.
3. Configuración de Meta Cloud API, plantillas aprobadas, política de consentimiento y tratamiento de datos personales (Colombia), reintentos y conciliación de entrega.
4. Redis o limitación compartida para PIN/login si existen múltiples instancias; monitoreo de abuso, captcha adaptativo y auditoría de staff.
5. Administración de cargos de habitación: visualizar, conciliar y cerrar `room_charges` al checkout. Hoy se asientan, pero no existe módulo contable de facturación hotelera.
6. Aplicar rate limiting adicional a checkout, seguimiento de órdenes, subida de imágenes y endpoints de alto costo, así como límites por usuario/dispositivo; controles antifraude y auditoría.
7. Pruebas automáticas con PostgreSQL de integración, flujos de pago simulado, roles, concurrencia, accesibilidad y regresión PWA.
8. Exportación CRM con consentimiento, base jurídica, derecho de rectificación/supresión, medidas de retención y privacidad. No se implementa retargeting automático.
9. Emisión de QR con firma o token validado por mesa, límites de consumo por habitación, tiempos de preparación, disponibilidad por franja horaria y horarios de operación.
10. Validación de políticas de facturación, IVA, propinas, impuestos y redondeo para el negocio real.

## Casos imprescindibles de aceptación

- Un cliente standard nunca obtiene un producto guest al manipular el frontend.
- Un PIN vencido, revocado o bloqueado no permite crear pedidos hoteleros.
- Una adición de COP 4.000 sobre COP 25.000, por 2 unidades, totaliza COP 58.000.
- Un modificador inventado no aparece en la orden y el checkout es rechazado.
- Carrito mixto crea exactamente una orden raíz y una suborden por cada área.
- Dos clics con mismo `idempotencyKey` no crean pedidos duplicados.
- Un pago online no pasa a cocina antes del webhook verificado.
- Una orden en efectivo solo inicia al confirmar el cajero.
- Un webhook repetido no genera segunda preparación.
- Cambiar `isAvailable` impide pedir el producto sin borrar historial.
- El menú del hotel no aparece en el catálogo público.
- Solo `admin` modifica los productos o accede al listado CRM.
