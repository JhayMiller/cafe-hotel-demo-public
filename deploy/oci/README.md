# CHU-DEP-001 — Despliegue propuesto en Oracle Cloud Always Free

**Estado: configuración de despliegue preparada, NO desplegada ni probada contra infraestructura real.**
Selección: Oracle Cloud Infrastructure (OCI) Always Free, Ampere A1 `VM.Standard.A1.Flex` ARM64, **máximo actual 2 OCPU/12 GB RAM** (límite total por cuenta, no por VM), Ubuntu Always Free elegible. La cuota de volumen de bloque de 200 GB **incluye** los discos de arranque; no suponer 200 GB adicionales libres. Crear recursos únicamente con etiqueta «Always Free eligible», dentro de la *home region*, sin depender de los 300 USD de prueba que vencen a los 30 días. Verificar disponibilidad de capacidad en el alta.

## Arquitectura de bajo costo y migrable

Cliente QR/PWA React y rutas de personal → Caddy (HTTPS, una sola URL) → API Express + Socket.IO → PostgreSQL 16. Los tres corren como contenedores multiarquitectura ARM64; PostgreSQL solo accesible por red Docker. Caddy gestiona TLS automáticamente mediante un nombre DNS real (propio o subdominio gratuito). La app utiliza cookies seguras de mismo origen; **no se debe usar IP directa por HTTP** para sesiones o huéspedes reales.

## Prerrequisitos y alta en OCI

1. El propietario crea su cuenta en https://www.oracle.com/cloud/free/; se requiere verificación de identidad y normalmente tarjeta, aunque no se cobran recursos estrictamente Always Free. No compartir tarjetas, contraseñas ni códigos en el chat o Drive.
2. En la consola OCI elegir **Ampere A1 ARM, 2 OCPU/12 GB** como límite, sistema **Ubuntu Always Free eligible**, volumen de arranque mínimo permitido (~50 GB). Confirmar antes de crear que aparecen los indicadores de **Always Free**. No elevar cuenta a PAYG ni añadir servicios pagos sin decisión posterior.
3. Elegir la *home region* considerando cobertura, latencia desde Colombia y capacidad (verificarlo, no adivinar región ni elegir una costosa). Si aparece «out of host capacity», **NO pasar automáticamente a pago**; revisar disponibilidad de otro availability domain o revaluar plan alternativo.
4. Crear y custodiar llave SSH del propietario (sin compartirla); restringir puerto 22 a sus IP autorizadas; abrir solo 80/TCP y 443/TCP al público. **NO exponer 5432, 4000 ni administración de Docker.** Configurar además firewall del SO según política y revisar IP pública.
5. Elegir un dominio o subdominio DNS **bajo control de la cuenta del propietario**. Para piloto estrictamente gratis, un proveedor de subdominios gratuitos puede servir, pero no garantiza permanencia del QR. Apuntar A → IP pública de OCI antes de iniciar Caddy. Conservar hostname al migrar cambiando DNS. Activar 2FA del proveedor DNS y OCI.

## Instalación (solo cuando se disponga de VM, DNS y autorización de Codex)

- Instalar Docker Engine + el plugin oficial Docker Compose de sus repositorios oficiales para ARM64/Ubuntu, manteniendo actualizaciones de seguridad.
- Copiar **todo** `cafe-hotel-unificado/` al servidor de forma segura. Trabajar en `deploy/oci/`.
- `cp .env.example .env` y editar con los valores reales; jamás publicar ni subir a un repo. Generar **tres secretos distintos** en la máquina o bóveda: `openssl rand -hex 32` para DB_PASSWORD, JWT_SECRET y PIN_PEPPER; puede usar mayor entropía según política. Completar `APP_HOST` con hostname DNS real, no un placeholder.
- `chmod 600 .env` y confirmar que la VM tiene puerto 80/443, DNS y reloj sincronizado para el ACME TLS.
- `docker compose --env-file .env config --quiet` para validar configuración sin mostrar secretos.
- `docker compose --env-file .env up -d --build` una vez; `docker compose --env-file .env ps` para estados.
- `curl -fsS https://HOST_REAL/api/health` para comprobar API (no equivale a verificar el negocio). La base SQL `001_init.sql` corre **solo si el volumen de postgres está recién creado**. Nunca ejecutar la inicialización a ciegas contra un volumen existente.
- Inicializar usuario administrador por un procedimiento temporal y seguro fuera del contenedor en producción; el script `scripts/create-admin.ts` no está dentro de la imagen de ejecución. Codex debe preparar el comando administrativamente seguro y evitar contraseñas como argumentos de shell visibles en historial o listado de procesos.

### Operaciones

- Reinicio: `docker compose --env-file .env restart`.
- Actualización: respaldo validado → aplicar migraciones versionadas si existen → `docker compose --env-file .env up -d --build` → validar la PWA, API, PIN, roles y un pedido ficticio.
- No hacer `docker compose down -v`: destruye el volumen de DB. No crear un 'script de carga' con claves públicas.
- El healthcheck de API refleja solo conectividad HTTP; agregar comprobación de DB/eventos y alertas antes de operación comercial.
- Configurar monitoreo liviano y alertas de disponibilidad; no mantener una VM artificialmente ocupada para evadir políticas de recuperación por inactividad de Oracle.

### Respaldo y portabilidad

- PostgreSQL: generar `pg_dump --format=custom` en un proceso con acceso restringido y validar restauración `pg_restore` en base de prueba. La copia cifrada debe estar fuera de la VM: si Oracle recupera el servidor, el volumen del mismo proveedor puede perderse. Automatizar backups antes de usar datos reales; definir retención, revisión de errores, RPO/RTO y titular de la clave de cifrado.
- Respaldar también archivos/objetos subidos, scripts de migración, inventario de recursos y configuración **sin secretos**; las claves permanecen en bóveda cifrada. OCI Object Storage Always Free puede ayudar dentro de cuota, pero **no reemplaza una copia fuera de OCI**.
- Para migrar, restaurar BD en el nuevo servidor y objetos al nuevo bucket, configurar secretos en el destino, comprobar idempotencia, checkout, RBAC, Wompi sandbox y notificaciones, y finalmente cambiar DNS. Mantener corto el TTL DNS antes de la ventana de cambio, detener escrituras para copia final y habilitar retroceso.

### Limitaciones y costos

- **Gratis no significa SLA**: Oracle puede recuperar instancias inactivas; no garantiza capacidad de A1 al crearla. Las cuotas gratuitas vigentes en octubre de 2026 son **2 OCPU y 12 GB** (Oracle redujo desde 4/24 en junio de 2026), 1,500 OCPU-h/9,000 GB-h al mes y 200 GB total de block volume. La prueba promocional de 30 días NO es una extensión permanente.
- El dominio propio, procesamientos de pago Wompi y mensajes de WhatsApp pueden costar dinero. Coste $0 presupuestado solo para recursos elegibles Always Free; revisar nuevas condiciones.
- Para pedidos o cobros reales se requiere pruebas de integración, vigilancia de disponibilidad, backups recuperables y plan de contingencia. Si se necesita un SLA, cambiar a servicio pago.

### Plan de contingencia

Si Oracle A1 no está disponible, no comprometer disponibilidad ni gastar sin consentimiento. Documentar bloqueo en CHU-OPS-001 y CHU-INS. Evaluar Oracle AMD micro para API ligera con **BD gestionada gratuita separada** o combinación Cloudflare Pages + Neon + backend alterno para un piloto, asumiendo sus limitaciones. Elegir alternativa antes de desplegar, sin crear recursos por cuenta propia.

### Fuentes oficiales verificadas (23 oct 2026)

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm
- https://www.oracle.com/cloud/free/faq/
