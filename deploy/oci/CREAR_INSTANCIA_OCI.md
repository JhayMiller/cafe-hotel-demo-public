# CHU-DEP-004 — Crear la primera instancia real en Oracle Cloud Always Free

**Importante: esta guía NO confirma que la instancia exista.** Cuenta OCI informada como creada por el propietario el 23 oct 2026. No se ha conectado a ChatGPT/Work ni se tiene acceso a la consola. Nunca pegar contraseñas, token API ni SSH privada en el chat.

## Paso 1 — Instancia gratuita en OCI

1. Entrar a https://cloud.oracle.com (la consola del usuario).
2. Menú ☰ → **Compute → Instances → Create instance**. Elegir la **home region** de la cuenta.
3. Nombre `gennesi-cafe-hotel`; sistema **Ubuntu 24.04 ARM64** compatible con A1. No elegir un sistema x86_64 para ARM.
4. **Change shape → Ampere → VM.Standard.A1.Flex**, 2 OCPU y 12 GB RAM como máximo de toda la cuenta (si ya consume cuota, restarla). Confirmar etiqueta **Always Free eligible** y ningún costo de uso fuera de cuotas. No elegir A2 ni otros shapes pagados.
5. Networking: VCN nueva o existente; **subred pública, asignar dirección IPv4 pública** para acceso web y SSH.
6. Clave SSH: **generar/descargar y guardar clave privada** solo en dispositivo/gestor seguro del propietario. No enviarla a ChatGPT ni a Drive.
7. Boot volume: usar tamaño predeterminado/mínimo (~50 GB), sin otros volúmenes ni backups de pago; la cuota Always Free de bloque es hasta 200 GB sumando discos de arranque y bloques.
8. **Advanced options → Management → Initialization script**: cargar el archivo `cloud-init.yaml` de esta carpeta. Solo instala Docker y crea la carpeta; no despliega una app ni cambia facturación. Evitar 'preemptible'.
9. **Review**: confirmar **Always Free** en recursos y almacenamiento. Si hay cargos o no hay A1 disponible, **detenerse**; no seleccionar un recurso pagado o crédito temporal de 30 días.
10. Pulsar Create. Guardar el nombre, región, ID de VM e IP pública (no son contraseñas) en `CHU-OPS-001` cuando la consola confirme el estado **Running**.

Documentación: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm y https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## Paso 2 — Red y dominio

- En la **Security List** o el **NSG** de la VCN/subred crear ingress TCP **80 y 443 desde 0.0.0.0/0**. SSH/TCP 22 solo desde la IP de administración conocida, no desde todo Internet.
- No abrir al público 5432, 4000, 2375, 2376 ni paneles de administración. OCI VCN y reglas del SO son controles distintos; verificar ambos.
- Elegir un hostname en DNS administrado por el propietario y crear un registro A apuntando a la IPv4 pública de la VM. Caddy necesita un hostname público resoluble para generar HTTPS. No imprimir códigos QR con una IP efímera.

## Paso 3 — Verificar cloud-init y transferir paquete

Con el cliente SSH del propietario (en Ubuntu la cuenta normalmente es `ubuntu`):

```bash
ssh -i /RUTA/CLAVE_PRIVADA ubuntu@IP_PUBLICA
sudo cat /var/log/gennesi-cafe-hotel-ready.log
sudo docker compose version
```

No publicar ni enviar la clave privada a ChatGPT. Transferir el paquete `cafe-hotel-unificado-oci-always-free.zip` o la versión más reciente mediante SFTP/SSH a la VM, descomprimir bajo `/opt/gennesi/cafe-hotel` y entrar en el directorio `cafe-hotel-unificado`. Para facilitar transferencia, usar una terminal local con `scp -i /RUTA/CLAVE_PRIVADA ARCHIVO.zip ubuntu@IP_PUBLICA:/tmp/` y descomprimir con acceso controlado. No usar un enlace público abierto con código de administración.

Desde la raíz del proyecto en la VM:

```bash
sudo bash deploy/oci/configurar-y-arrancar.sh
```

El script pide un **nombre de DNS real** y crea tres secretos aleatorios en `deploy/oci/.env` restringido. No ejecutarlo dos veces para recrear claves: conserva .env existente. No actives cobros/WhatsApp reales hasta probarlos con sandbox y consentimiento. El alta inicial de administrador requiere un flujo seguro adicional; no pasar contraseñas por argumentos de shell.

## Paso 4 — Comprobaciones obligatorias antes de usarlo

- `https://HOST_REAL/api/health` responde JSON con `ok:true`.
- HTTPS válido y panel web accesible desde red móvil distinta de la VM.
- PostgreSQL saludable; no accesible desde la Internet pública.
- Validar inicio de sesión, roles, PIN temporal, pedidos divididos café/hotel, tiempo real y procesamientos con datos ficticios.
- Configurar respaldo cifrado FUERA de Oracle (e.g., destino del propietario), y verificar restauración. La guía NO afirma que las copias ya existan.

## Limitación actual

La instancia no se puede crear automáticamente en este chat sin la sesión de consola o una integración autenticada para Oracle. Para operar la consola por navegador se necesita ChatGPT Work con su navegador, si ese modo está disponible al usuario, o que el propietario siga estas instrucciones dentro de Oracle. No copiar la clave privada de SSH ni códigos de verificación al asistente.
