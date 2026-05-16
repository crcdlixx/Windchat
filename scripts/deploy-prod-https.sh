#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
WindChat production HTTPS deployment.

Usage:
  ./scripts/deploy-prod-https.sh <domain> <email> [--staging] [--skip-cert] [--with-minio]

Examples:
  ./scripts/deploy-prod-https.sh chat.example.com admin@example.com
  ./scripts/deploy-prod-https.sh chat.example.com admin@example.com --staging

Options:
  --staging    Use Let's Encrypt staging certificates for a dry run.
  --skip-cert  Skip certificate issuance and start the production stack.
  --with-minio Start the bundled MinIO profile.

Requirements:
  - Docker Compose v2
  - DNS for <domain> points to this server
  - Ports 80 and 443 are open
USAGE
}

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 | tr -d '\n'
  else
    dd if=/dev/urandom bs=32 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-.env}"
  local escaped

  escaped=$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')
  if grep -Eq "^[#[:space:]]*${key}=" "$file"; then
    sed -i.bak -E "s|^[#[:space:]]*${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

get_env_value() {
  local key="$1"
  local file="${2:-.env}"
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2- || true
}

ensure_secret() {
  local key="$1"
  local current

  current="$(get_env_value "$key")"
  if [[ -z "$current" || "$current" == change_me* ]]; then
    set_env_value "$key" "$(random_secret)"
  fi
}

compose() {
  docker compose "$@"
}

DOMAIN="${1:-}"
ACME_EMAIL="${2:-}"
STAGING=0
SKIP_CERT=0
WITH_MINIO=0

shift $(( $# >= 1 ? 1 : 0 ))
shift $(( $# >= 1 ? 1 : 0 ))

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staging) STAGING=1 ;;
    --skip-cert) SKIP_CERT=1 ;;
    --with-minio) WITH_MINIO=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

[[ -n "$DOMAIN" ]] || { usage; die "Missing domain."; }
[[ -n "$ACME_EMAIL" ]] || { usage; die "Missing email."; }
command -v docker >/dev/null 2>&1 || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

[[ -f docker-compose.yml ]] || die "Run this script from the WindChat repository."

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

log "Updating production environment"
set_env_value DOMAIN "$DOMAIN"
set_env_value ACME_EMAIL "$ACME_EMAIL"
set_env_value CORS_ORIGIN "https://${DOMAIN}"
set_env_value VITE_API_URL "/api"
set_env_value VITE_WS_URL "/ws"
set_env_value NODE_ENV "production"

if [[ "$STAGING" -eq 1 ]]; then
  set_env_value CERTBOT_EXTRA_ARGS "--staging"
else
  set_env_value CERTBOT_EXTRA_ARGS ""
fi

ensure_secret POSTGRES_PASSWORD
ensure_secret JWT_SECRET
ensure_secret JWT_REFRESH_SECRET
ensure_secret ADMIN_SECRET
ensure_secret MINIO_ROOT_PASSWORD
if [[ "$WITH_MINIO" -eq 1 ]]; then
  set_env_value S3_ENDPOINT "http://minio:9000"
  set_env_value S3_ACCESS_KEY "minioadmin"
  set_env_value S3_SECRET_KEY "$(get_env_value MINIO_ROOT_PASSWORD)"
else
  ensure_secret S3_SECRET_KEY
fi

COMPOSE_PROD=(-f docker-compose.yml -f docker-compose.prod.yml)
COMPOSE_ACME=(-f docker-compose.yml -f docker-compose.acme.yml)
if [[ "$WITH_MINIO" -eq 1 ]]; then
  COMPOSE_PROD+=(--profile minio)
  COMPOSE_ACME+=(--profile minio)
  set_env_value STORAGE_TYPE "minio"
fi

log "Validating Docker Compose files"
compose "${COMPOSE_ACME[@]}" config --quiet
compose "${COMPOSE_PROD[@]}" config --quiet

if [[ "$SKIP_CERT" -eq 0 ]]; then
  log "Starting ACME bootstrap Nginx on port 80"
  compose "${COMPOSE_ACME[@]}" up -d --build nginx

  log "Requesting Let's Encrypt certificate for ${DOMAIN}"
  compose "${COMPOSE_ACME[@]}" --profile acme run --rm certbot-init
else
  log "Skipping certificate issuance"
fi

log "Starting production HTTPS stack"
compose "${COMPOSE_PROD[@]}" up -d --build

log "Current service status"
compose "${COMPOSE_PROD[@]}" ps

log "Checking HTTPS health endpoint"
if command -v curl >/dev/null 2>&1; then
  curl -fsS "https://${DOMAIN}/api/health" >/dev/null && log "Health check passed"
else
  log "curl is not installed; skipping health check"
fi

cat <<EOF

WindChat production deployment finished.

Open:
  https://${DOMAIN}

Browser encryption check:
  window.isSecureContext === true
  window.crypto?.subtle is available

Useful commands:
  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=10m backend nginx certbot-renew
EOF
