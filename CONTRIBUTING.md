# Contributing to WindChat

Thanks for helping improve WindChat.

## Local Setup

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Replace every placeholder secret in `.env`.
3. Start the full stack:

   ```bash
   docker compose up -d
   ```

4. Open `http://localhost`.

For split frontend/backend development, see [docs/windchat_development_guide.md](docs/windchat_development_guide.md).

## Checks Before Opening a Pull Request

Run these from the repository root:

```bash
docker compose config --quiet
```

```bash
cd backend
npm audit --omit=dev --registry=https://registry.npmjs.org
node --check src/index.js
```

```bash
cd frontend
npm audit --omit=dev --registry=https://registry.npmjs.org
npm run build
```

If your change touches more backend files, run `node --check` on each changed JavaScript file under `backend/src`.

## Security-Sensitive Changes

Be explicit about the security boundary in pull requests. WindChat currently encrypts private chat text with Signal Protocol in the browser, but group chat text, attachments, and notes are not end-to-end encrypted yet.
