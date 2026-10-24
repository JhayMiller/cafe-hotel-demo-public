# Instrucción de trabajo para Codex — Café + Hotel

Actúa como arquitecto de software y desarrollador Full-Stack. Utiliza **los archivos del proyecto ya suministrados**; no generes una aplicación paralela desde cero.

## Objetivo

Llevar el sistema de pedidos unificado Café + Hotel desde su esqueleto funcional a un MVP confiable y desplegable, sin romper la separación de roles, menús, pagos, subórdenes, eventos y el CMS.

## Lecturas obligatorias antes de modificar

1. `README.md`.
2. `docs/ARQUITECTURA.md`.
3. `apps/api/sql/001_init.sql`.
4. Endpoints `apps/api/src/routes/orders.ts`, `catalog.ts`, `access.ts`, `operations.ts`, `webhooks.ts`.

## Prioridades de implementación

1. Instalar dependencias y compilar API y frontend; corregir errores de tipos y dependencias sin modificar reglas de negocio.
2. Crear pruebas mínimas automatizadas con base PostgreSQL aislada para acceso por PIN, expiración/revocación, RBAC de CMS, validación de modificadores, checkout mixto, idempotencia, transiciones de staff y webhook verificado.
3. Completar interfaz de personal: autenticación, navegación por rol, Kanban claro, confirmación de cobro, recepción rápida, CRM y edición de grupos reutilizables.
4. Verificar el proveedor Wompi **en sandbox** de extremo a extremo y registrar correctamente pagos fallidos/reintentados en nuevos `payment_attempts` de referencia única.
5. Completar límites de tasa distribuidos, QR de mesa firmado, trazabilidad de eventos, cargos de habitación y privacidad de clientes.
6. Configurar despliegue HTTPS, dominio, backups, variables secretas y monitoreo.

## Reglas estrictas

- Cambios pequeños, concentrados y comprobables. Priorizar efectividad y el uso eficiente de tiempo, contexto y tokens.
- Nada de pruebas redundantes ni procesos que no aporten a la entrega.
- No revelar contraseñas, PIN, tokens o datos personales en logs.
- Todo monto en PostgreSQL se expresa en pesos COP enteros; Wompi espera centavos (×100).
- Evitar estados de preparación sin pago confirmado para café.
- El `hotel` se procesa independientemente del `cafe` tras checkout válido.
- Recalcular precio, visibilidad, opciones y disponibilidad en backend.
- Productos eliminados deben conservar trazabilidad histórica en `order_items`.
- No confiar en cualquier campo `role`, `price` o `area` enviado por clientes.
- Registrar archivos afectados, decisiones y pruebas realmente ejecutadas en el informe de cada cambio.
- Si faltan claves o servicios, implementar adaptadores e indicar explícitamente qué no es posible probar todavía; no simular una integración real.

## Entregable esperado de cada iteración

Código editado + breve informe que explique: archivos cambiados, pruebas realizadas y su resultado, limitaciones pendientes, y siguiente paso técnicamente imprescindible.

## CHU-INS-002 — Infraestructura Oracle Cloud Always Free (autorización de selección, despliegue pendiente)

- Elegir OCI Ampere A1 como hospedaje objetivo; cuota **2 OCPU y 12 GB** para la cuenta Always Free según información oficial octubre 2026. No contratar ni crear recursos de pago. No interpretar los 300 USD de prueba como plan permanente.
- Archivos preparados: `deploy/oci/README.md`, `deploy/oci/compose.yaml`, `deploy/oci/Caddyfile`, `deploy/oci/.env.example`, `apps/api/Dockerfile`, `apps/web/Dockerfile`.
- Despliegue propuesto de **un solo origen HTTPS**: Caddy → PWA React/Express-Socket.IO → PostgreSQL 16; PostgreSQL privado. Mantener datos en volumen persistente y copias externas cifradas.
- Cuando haya cuenta OCI y hostname real: validar build ARM64, migración SQL, salud API, seguridad de cookies, PIN/TTL, acceso por roles, checkout mixto, idempotencia y Socket.IO. Solo pruebas imprescindibles; no pruebas reiteradas ni cambios ajenos al servidor.
- No se permiten credenciales reales en documentos, repositorios ni mensajes. Registrar servidor, cuenta y referencias a secretos en `CHU-OPS-001` de Drive, no contraseñas.
- **Estado actual:** infraestructura preparada como archivos, **NO existe servidor desplegado** ni integración funcional certificada. Codex no debe atribuir configuración real hasta aportar evidencia de VM, dominio y endpoints HTTPS.
