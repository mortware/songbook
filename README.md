# Songbook

Personal ChordPro songbook PWA — view and edit ChordPro documents linked to the
existing Trax track library. Optimised for an 8.5" tablet at performance time,
with full offline support. See [songbook-spec.md](songbook-spec.md) for the
full specification.

## Stack

- **Next.js** (App Router, single container: frontend + API routes)
- **Azure Cosmos DB** — existing `tracks` container (metadata) + new
  `chordpro` container (content, partition key `/slug`)
- **Auth0** — session auth via `@auth0/nextjs-auth0`; every page and API
  route is gated in [src/middleware.ts](src/middleware.ts)
- **Dexie.js (IndexedDB)** — all songs mirrored locally on every load
- **Service worker** ([public/sw.js](public/sw.js)) — caches the app shell so
  the installed PWA boots with no network

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Required environment variables (see [.env.example](.env.example)):

| Variable | Notes |
| --- | --- |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Regular Web Application in the existing tenant. Callback URL: `<APP_BASE_URL>/auth/callback`, logout URL: `<APP_BASE_URL>` |
| `AUTH0_SECRET` | `openssl rand -hex 32` — session cookie encryption |
| `APP_BASE_URL` | `http://localhost:3000` locally; the public URL in production |
| `ALLOWED_EMAILS` | Optional comma-separated allow-list; anyone else gets 403 even with a valid Auth0 account |
| `COSMOS_CONNECTION_STRING` / `COSMOS_DATABASE` | Existing Cosmos instance |
| `COSMOS_TRACKS_CONTAINER` / `COSMOS_CHORDPRO_CONTAINER` | Default `tracks` / `chordpro` |

The `chordpro` container must exist with partition key `/slug` (the app does
not create it). Tests: `npm test` (ChordPro parser unit tests, including a
round-trip of [example.pro](example.pro)).

## Offline behaviour

- On every authenticated load (and whenever connectivity returns) the app
  pulls `/api/sync` and mirrors all ChordPro docs into IndexedDB.
- Offline: list + viewer read from IndexedDB, an amber banner shows, and
  Edit/Save/Delete are disabled (no offline write queue in v1).
- The service worker caches a generic `/songs/__shell__` page that serves any
  song URL offline — the page reads its slug from `location` rather than
  router params, so every synced song opens offline even if never visited.
- The SW is only registered in production builds (`npm run dev` is uncached).

## Deployment (Azure Container Apps)

```bash
docker build -t songbook .

# Example: push to ACR and create the container app in the existing environment
az acr build --registry <acr-name> --image songbook:latest .
az containerapp create \
  --name songbook \
  --resource-group <rg> \
  --environment <existing-aca-env> \
  --image <acr-name>.azurecr.io/songbook:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 0 --max-replicas 1 \
  --secrets cosmos-conn=<...> auth0-secret=<...> auth0-client-secret=<...> \
  --env-vars \
    APP_BASE_URL=https://<public-url> \
    AUTH0_DOMAIN=<tenant>.auth0.com \
    AUTH0_CLIENT_ID=<id> \
    AUTH0_CLIENT_SECRET=secretref:auth0-client-secret \
    AUTH0_SECRET=secretref:auth0-secret \
    ALLOWED_EMAILS=<your-email> \
    COSMOS_CONNECTION_STRING=secretref:cosmos-conn \
    COSMOS_DATABASE=<db-name>
```

`--min-replicas 0` keeps cost near zero; cold starts are fine because the
PWA serves from IndexedDB while the container wakes. Remember to add the
production callback/logout URLs to the Auth0 application.

## API

All routes require an authenticated session (401 otherwise).

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/songs` | Tracks that have a chordpro doc |
| GET | `/api/songs/without-chordpro` | Tracks without a chordpro doc |
| GET | `/api/songs/[slug]` | Track metadata + content (`content: null` if none) |
| PUT | `/api/songs/[slug]` | Create/update doc (`{ "content": "..." }`); 404 if the track doesn't exist |
| DELETE | `/api/songs/[slug]` | Delete doc |
| GET | `/api/sync` | All docs joined with track metadata, for offline sync |
