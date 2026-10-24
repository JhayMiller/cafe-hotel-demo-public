#!/usr/bin/env bash
# CHU-DEP-003 — Ejecutar EN LA VM luego de copiar todo el proyecto y configurar DNS.
# No usar con pedidos reales sin respaldo externo y prueba de restauración.
set -euo pipefail
cd "$(dirname "$0")"
if [[ "$(id -u)" -ne 0 ]]; then
  echo 'Ejecutar: sudo bash deploy/oci/configurar-y-arrancar.sh' >&2
  exit 1
fi
command -v docker >/dev/null || { echo 'Docker no está instalado: verificar cloud-init.' >&2; exit 1; }
docker compose version >/dev/null || { echo 'Falta Docker Compose v2.' >&2; exit 1; }
if [[ -f .env ]]; then
  echo 'Ya existe .env: no se modificarán credenciales. Para reiniciar usar: sudo docker compose --env-file .env up -d --build'
  exit 2
fi
read -r -p 'Introduce hostname DNS REAL (ej.: cafe.ejemplo.com), sin https:// : ' APP_HOST
if [[ ! "$APP_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]] || [[ "$APP_HOST" == *..* ]]; then
  echo 'Hostname DNS inválido. Configura primero el registro A al IPv4 público de OCI.' >&2
  exit 1
fi
# No loguear secretos. Solo caracteres hexadecimales para DATABASE_URL.
umask 077
DB_PASSWORD="$(openssl rand -hex 32)"
JWT_SECRET="$(openssl rand -hex 32)"
PIN_PEPPER="$(openssl rand -hex 32)"
cat > .env <<CONFIG
APP_HOST=${APP_HOST}
DB_NAME=cafe_hotel
DB_USER=cafehotel
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
PIN_PEPPER=${PIN_PEPPER}
# Integraciones externas: desactivadas hasta habilitación y pruebas formales.
WOMPI_PUBLIC_KEY=
WOMPI_INTEGRITY_SECRET=
WOMPI_EVENTS_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
CONFIG
chmod 600 .env
unset DB_PASSWORD JWT_SECRET PIN_PEPPER
# No revelar variables de entorno con docker compose config normal.
docker compose --env-file .env config --quiet
printf '\nLa aplicación se construirá y arrancará. No usar datos reales hasta validar accesos, pedidos y respaldos.\n'
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
printf '\nConsulta: https://%s/api/health\n' "$APP_HOST"
printf 'Guardar un respaldo CIFRADO de la VM/DB y la referencia de claves en la bóveda: NO subir .env a Drive/Git.\n'
