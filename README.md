# Posada del Puerto — Café + Hotel

Servicio de marca blanca para operación integrada de café y hotel. Incluye frontend React PWA, API Express/TypeScript, PostgreSQL, perfiles de personal, PIN de huésped con caducidad, edición de carta, personalización de marca, Web Checkout Wompi, webhook autenticado, tablero en vivo y outbox WhatsApp.

**Estado:** piloto desplegable para demostración y validación. Los pagos reales permanecen desactivados hasta configurar una cuenta del comercio, aceptar sus tarifas y completar pruebas de sandbox. No se incluyen secretos en el repositorio.

## Requisitos

- Node.js **22.17 o superior** (Vite 7), npm y PostgreSQL 15+.
- Mismo dominio de origen para frontend y API en producción; se recomienda `/api` y `/socket.io` por reverse proxy HTTPS.

## Puesta en marcha local

1. Crear base de datos y aplicar migración:

   ```bash
   createdb cafe_hotel
   psql -d cafe_hotel -f apps/api/sql/001_init.sql
   ```

2. Copiar `apps/api/.env.example` a `apps/api/.env`; configurar `DATABASE_URL`, `JWT_SECRET` y `PIN_PEPPER` con **secretos aleatorios distintos** de al menos 32 caracteres. La app no arranca sin ellos.
3. En una terminal:

   ```bash
   cd apps/api
   npm install
   npm run dev
   ```

4. Registrar una cuenta administradora después de migrar la base:

   ```bash
   cd apps/api
   npm run seed:admin -- admin@ejemplo.com 'CONTRASENA_LARGA_Y_ALEATORIA'
   ```

   En un despliegue sin consola puede definirse una sola vez `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (mínimo 12 caracteres) e `INITIAL_ADMIN_NAME`. Al reiniciar, la cuenta se crea solo si todavía no existe otro administrador. Después se debe retirar `INITIAL_ADMIN_PASSWORD` de las variables del servidor.

5. En otra terminal:

   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

6. Abrir `http://localhost:5173`. Personal: `http://localhost:5173/personal`. El QR de una mesa puede dirigir a `http://localhost:5173/?mesa=M12`.
7. Iniciar sesión como administrador, crear al menos una habitación y los productos iniciales. Recepción puede crear estancias y generar PIN.

> La vista de administración y el tablero de operaciones comparten el origen con la PWA. En producción, proteger la administración mediante controles adicionales (MFA, auditoría, políticas de acceso).

## Configuraciones externas

### Pago Wompi

Definir `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_ENV=test`. Para producción cambiar a claves y entorno de producción, con webhook HTTPS dirigido a `/api/webhooks/wompi`. La generación del Web Checkout conserva la referencia y total calculados en backend. El webhook valida checksum, referencia, importe, moneda y ambiente; un retorno visual no aprueba el pedido. Sin claves, el pago online **no permite iniciar preparación**.

### WhatsApp

Configurar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION`, y los nombres de plantillas transaccionales aprobadas `WHATSAPP_TEMPLATE_READY`, `WHATSAPP_TEMPLATE_DISPATCHED`. El worker se activa automáticamente al iniciar la API. Si no hay consentimiento o número, el evento se marca omitido y el cliente aún puede consultar estados en la web.

### Fotos

Configurar `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT` (opcional), `STORAGE_PUBLIC_BASE_URL`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`. El endpoint admin entrega un enlace `PUT` presignado de 60 segundos. Aplicar CORS en el bucket para el dominio de la web; no hacer público el bucket completo si no corresponde.

## Qué incluye y qué falta

| Módulo | Estado en este paquete |
|---|---|
| PWA y QR con mesa | Base funcional; código de mesa aún no está firmado |
| Catálogo standard / guest | Implementado y filtrado en backend |
| PIN y vigencia por estancia | Implementado; bloqueo persistido en DB |
| Carrito y validación de opciones | Implementado |
| Checkout dividido en subórdenes | Implementado transaccionalmente |
| Wompi Web Checkout y webhook | Adaptador incluido; requiere configuración y ensayo sandbox |
| Paneles staff y actualización Socket.IO | Base operativa incluida |
| CMS CRUD / disponibilidad / modificadores | Incluido |
| Marca blanca | Nombre, logo, imagen principal y paleta editables desde el panel |
| Cuentas del personal | Alta, roles, activación y cambio de contraseña desde el panel |
| Portal de huéspedes | Acceso por habitación y PIN, amenidades, carta y seguimiento |
| Imágenes | Endpoint de presign incluido, requiere bucket |
| CRM visitas y ticket promedio | Consulta incluida; solo pedidos finalizados |
| Avisos WhatsApp | Outbox y worker incluidos; requieren token + plantillas y consentimiento |
| Cuenta habitación | Registro contable simple incluido; conciliación/facturación pendiente |
| Despliegue y pruebas de integración | Pendientes |

La base se acompaña de [documentación de arquitectura](docs/ARQUITECTURA.md) y un [listado de tareas para Codex](docs/CODEX_INSTRUCCIONES.md).

## Reglas de trabajo para Codex

- No reescribir módulos funcionales ni cambiar contratos API/SQL sin motivo.
- No usar credenciales reales en código, pruebas, repositorios ni frontend.
- Mantener toda validación de rol y cálculo de precio en el backend.
- Ejecutar solo pruebas necesarias para los archivos tocados, además de compilación y casos críticos de checkout/roles cuando correspondan.
- No automatizar campañas WhatsApp sin consentimiento granular y controles legales.
- Antes de desplegar, completar la lista de controles de `docs/ARQUITECTURA.md`.

## Despliegue gratis preconfigurado (Oracle Cloud Always Free)

La elección inicial es **Oracle Cloud Always Free Ampere A1** (ARM64, cuota total de 2 OCPU/12 GB), sujeto a disponibilidad, con Caddy HTTPS + PWA + Express/Socket.IO + PostgreSQL 16 en contenedores. Archivo de infraestructura: [`deploy/oci/compose.yaml`](deploy/oci/compose.yaml); guía y límites reales: [`deploy/oci/README.md`](deploy/oci/README.md). **No hay servidor ni credenciales creados y no se ha realizado un despliegue real.** Requiere cuenta OCI del propietario, DNS propio o subdominio y secretos custodiados en bóveda. El registro de servicios se gestiona en Drive mediante `CHU-OPS-001`; no almacenar contraseñas allí.

## Piloto gratuito en Render + Neon

El `Dockerfile` de la raíz compila la PWA y la API en un solo servicio HTTPS. `render.yaml` fija el servicio en el plan `free`; la variable `DATABASE_URL` se conecta a un proyecto PostgreSQL gratuito de Neon. Al arrancar, la API aplica las migraciones pendientes una sola vez y carga un catálogo piloto.

No añadir tarjetas, servicios de pago ni secretos al repositorio. Los planes gratuitos pueden suspender el servicio por inactividad y tienen límites de uso; este despliegue sirve para demostración y validación, no para operación comercial continua.
