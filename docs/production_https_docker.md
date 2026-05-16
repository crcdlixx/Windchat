# Production HTTPS Docker Deployment

This deployment uses the existing WindChat containers plus an HTTPS Nginx entrypoint and Certbot. The default `docker-compose.yml` remains the local HTTP setup; production uses compose override files.

## Prerequisites

- A server with Docker Compose v2.
- A public DNS record such as `chat.example.com` pointing to the server.
- Ports `80` and `443` open to the internet.
- A completed `.env` file with real secrets.

## Environment

Copy the example environment and set production values:

```bash
cp .env.example .env
```

Set at least these values:

```env
DOMAIN=chat.example.com
ACME_EMAIL=admin@example.com
CORS_ORIGIN=https://chat.example.com
VITE_API_URL=/api
VITE_WS_URL=/ws
NODE_ENV=production
```

Replace all placeholder passwords and JWT secrets before exposing the service.

## One-Command Deployment

On a Linux server, you can run the bundled deployment script from the repository root:

```bash
chmod +x scripts/deploy-prod-https.sh
./scripts/deploy-prod-https.sh chat.example.com admin@example.com
```

For a Let's Encrypt staging dry run:

```bash
./scripts/deploy-prod-https.sh chat.example.com admin@example.com --staging
```

The script creates `.env` when needed, fills production URLs, generates missing placeholder secrets, requests the certificate, and starts the HTTPS stack.

For a dry run against Let's Encrypt staging, add:

```env
CERTBOT_EXTRA_ARGS=--staging
```

Remove that line before requesting the real certificate.

## First Certificate

Start the HTTP-only ACME bootstrap Nginx:

```bash
docker compose -f docker-compose.yml -f docker-compose.acme.yml up -d --build nginx
```

Request the certificate:

```bash
docker compose -f docker-compose.yml -f docker-compose.acme.yml --profile acme run --rm certbot-init
```

The certificate is stored in the shared `letsencrypt` Docker volume under the fixed Certbot name `windchat`.

## Start Production

Switch to the HTTPS production stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Check the services:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -f https://chat.example.com/api/health
```

Open `https://chat.example.com` in a browser and verify:

```js
window.isSecureContext
window.crypto?.subtle
```

Both should be truthy. This is required for WindChat's browser encryption APIs.

## Renewal

`certbot-renew` runs `certbot renew` every 12 hours. The production Nginx container reloads itself every 12 hours so renewed certificates are picked up automatically.

You can force a renewal check manually:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec certbot-renew certbot renew --dry-run
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
```

## Updating

Pull or copy new code, then rebuild:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Review recent logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=10m backend nginx certbot-renew
```

## Notes

- HTTP traffic redirects to HTTPS, except ACME challenge files under `/.well-known/acme-challenge/`.
- Nginx uses `/etc/letsencrypt/live/windchat/fullchain.pem` and `privkey.pem`, so the public domain is configured only in `.env`.
- Keep `VITE_API_URL=/api` and `VITE_WS_URL=/ws` unless the frontend is hosted on a different origin.
- If you previously tested over plain HTTP, clear the browser tab and revisit the HTTPS URL before retesting message encryption.
