# Songbook Web App — Project Specification

## Overview

A personal, device-friendly web app for viewing and editing ChordPro documents linked to an existing track library. Built as a Progressive Web App (PWA) with full offline support, hosted on Azure Container Apps alongside an existing deployment.

---

## Goals

- Replace the Songbook Android/Windows app with a purpose-built experience optimised for an 8.5" tablet at performance time
- Eliminate unreliable Google Drive sync by storing ChordPro content in Cosmos DB
- Leverage existing Trax database for song metadata — no duplication
- Keep Azure hosting costs low
- Remain usable offline with all songs synced to the device

---

## Tech Stack

| Concern         | Choice                   | Notes                                          |
| --------------- | ------------------------ | ---------------------------------------------- |
| Framework       | Next.js (React)          | Single container; API routes + frontend        |
| Database        | Azure Cosmos DB (NoSQL)  | Existing instance; new `chordpro` container    |
| Auth            | Auth0                    | Existing Auth0 tenant                          |
| Hosting         | Azure Container Apps     | Existing environment; new container            |
| Offline storage | IndexedDB (via Dexie.js) | Syncs all ChordPro docs on load                |
| PWA             | Next.js + Service Worker | App shell cached; offline reads from IndexedDB |

---

## Architecture

```
Browser / PWA (Next.js)
        │
        │  HTTPS
        ▼
Next.js API Routes  ──►  Azure Cosmos DB
        │                  ├── tracks container (existing)
        │                  └── chordpro container (new)
        │
   Auth0 (JWT validation on all API routes)
```

The Next.js app is containerised and deployed as a new container within the existing Azure Container Apps environment. It handles both the React frontend and the Cosmos DB API layer in a single deployment unit.

---

## Data Model

### Existing: `tracks` container

Used as the source of truth for song identity. Relevant fields:

```json
{
  "slug": "some-song-artist-and-title",      // unique identifier — used as FK
  "title": "Some Song Title",
  "artist": "Artist Name",
   "tempo": {
      "bpm": 147,
      "variable": true
   },
   "duration": "08:33",
   "songKey": "Bm",
}
```

### New: `chordpro` container

Partition key: `/slug`

```json
{
  "id": "<uuid>",
  "slug": "some-song-title",      // FK → trax.slug
  "content": "{title: Some Song Title}\n[Am]Some [G]lyrics...",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

Song metadata (title, artist, BPM) is always read from the `tracks` container via slug. The `chordpro` container stores only the raw ChordPro text and timestamps.

---

## API Routes

All routes are protected by Auth0 JWT middleware.

| Method   | Route                         | Description                                                |
| -------- | ----------------------------- | ---------------------------------------------------------- |
| `GET`    | `/api/songs`                  | List all songs that have a corresponding chordpro document |
| `GET`    | `/api/songs/without-chordpro` | List songs that do NOT have a chordpro document            |
| `GET`    | `/api/songs/[slug]`           | Get song metadata + chordpro content for a song            |
| `PUT`    | `/api/songs/[slug]`           | Create or update the chordpro document for a song          |
| `DELETE` | `/api/songs/[slug]`           | Delete a chordpro document                                 |
| `GET`    | `/api/sync`                   | Return all chordpro documents for offline sync             |

---

## PWA & Offline Sync

On first authenticated load (and on each subsequent app open), the app calls `/api/sync` and writes all ChordPro documents into IndexedDB via Dexie.js. The Next.js service worker caches the app shell.

When the device is offline:
- Song list and ChordPro content are served from IndexedDB
- Edit/save is **disabled** offline (no queued writes in v1 — keep it simple)
- A visible banner indicates offline mode

When connectivity is restored the app re-syncs automatically.

---

## Features

### MVP

1. **Auth0 login** — secure single-user login; all routes gated
2. **Song list** — shows only tracks with a ChordPro document by default
   - Toggle filter: "Show tracks without ChordPro" (for adding new content)
   - Displays title and artist from `tracks`
3. **ChordPro viewer** — renders a ChordPro document for performance use
   - Handles: lyrics, chords above lyrics, tab blocks, section headings, free text
   - Does not need to support full ChordPro spec (columns, grids, etc. out of scope for v1)
   - Adjustable font size (user-controlled +/− toggle)
   - Auto-sizing: on load, attempt to fit content to viewport width before user adjustment
   - No auto-scroll (tab structure is non-linear)
   - Clean, high-contrast, minimal chrome — optimised for 8.5" tablet at arm's length
4. **ChordPro editor** — plain text editor for creating and editing ChordPro content
   - Linked to a specific `tracks` slug
   - Save writes to `/api/songs/[slug]`
   - Syntax highlighting: deferred to post-MVP
5. **Offline support** — full IndexedDB sync on load, read-only when offline

### Post-MVP (future iterations)

- Syntax highlighting in the editor (e.g., CodeMirror with a ChordPro mode)
- Tags and setlists
- Transpose (chords only — tab transposition is out of scope)
- Backing track playback (trigger the associated Tracks mix from within the viewer)
- Bulk import from a folder of `.cho` / `.chordpro` files
- Full ChordPro directive support (columns, chord grids, etc.)
- Offline write queue (sync edits made offline when reconnected)

---

## ChordPro Rendering Notes

The renderer must handle at minimum:

- `{title:}`, `{artist:}`, `{key:}` directives (display in header)
- `{start_of_verse}`, `{end_of_verse}`, `{start_of_chorus}`, `{end_of_chorus}` section markers
- `{start_of_tab}`, `{end_of_tab}` — render content in monospace, preserve whitespace exactly
- Inline chord markers: `[Am]`, `[G7]`, `[F#m]` etc. — render above the following syllable
- Free text / comment lines

Chords-above-lyrics layout must align chords precisely over the correct syllable. Tab blocks must not wrap.

---

## Deployment

- Containerise the Next.js app with a standard `Dockerfile`
- Deploy as a new container to the existing Azure Container Apps environment
- Environment variables: Cosmos DB connection string, Auth0 domain/client ID/secret
- No separate API container needed — Next.js API routes handle all backend logic

---

## Out of Scope

- Multi-user support
- Google Drive sync
- Native Android/Windows app
- ChordPro chord diagram / grid rendering
- Any interaction with the existing public-facing website container