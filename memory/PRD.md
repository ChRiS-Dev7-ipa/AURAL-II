# PRD — AURAL / MP3 (Audio URL → MP3 Converter)

## Goal
Mobile app that converts an audio URL (SoundCloud, YouTube, Bandcamp, Vimeo, direct .mp3/.wav/.m4a/.ogg/.flac links, etc.) into a 192 kbps MP3 file and saves it to the iPhone Files app via the iOS share sheet.

## Stack
- **Frontend:** Expo SDK 54 (React Native), expo-router file-based routes
- **Backend:** FastAPI + Motor (MongoDB)
- **Audio pipeline:** `yt-dlp` for source resolution + bundled `ffmpeg` from `imageio-ffmpeg` (libmp3lame, 192 kbps) — no system ffmpeg dependency; urllib fallback for direct audio file URLs; 50 MB hard cap on downloads (yt-dlp `max_filesize` + Content-Length / bytes-written guard).
- **Persistent storage:** MP3s live under `/app/backend/storage/conversions` (configurable via `CONVERSIONS_DIR` env). Startup hook prunes dangling history rows whose files were removed.

## Backend endpoints (all prefixed `/api`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | Health check |
| POST | `/convert` | Body `{url}` → downloads + transcodes to MP3, persists to `conversions` collection, returns `Conversion` |
| GET | `/conversions` | List all conversions, newest first |
| GET | `/conversions/{id}` | Single record |
| DELETE | `/conversions/{id}` | Remove record + MP3 from disk |
| GET | `/file/{id}` | Stream MP3 with `audio/mpeg` + `Content-Disposition: attachment` |

`Conversion` model: `id, url, title, artist, duration, thumbnail, filename, size_bytes, created_at`. MP3s are stored under `/tmp/conversions`.

## Frontend
File-split structure under `/app/frontend`:
- `app/index.tsx` (~370 lines) — orchestration: header, history list, bottom dock (URL input + paste + CONVERT button), wires up modals.
- `src/components/HistoryRow.tsx` — list row (thumbnail, title, meta, delete X).
- `src/components/PlayerModal.tsx` — bottom-sheet player (album art, progress, ±10s seek via `expo-audio`, SAVE TO FILES).
- `src/components/ConfirmDelete.tsx` — Swiss-Brutalist DELETE TRACK card with CANCEL / DELETE.
- `src/lib/converter.ts` — shared `Conversion` type, API base, formatters.

The bottom **"SAVE TO FILES"** button calls `expo-sharing` → iOS share sheet → user taps **Save to Files** to drop the MP3 into the iPhone Files app. Outfit (headings) + JetBrains Mono (metadata) fonts, dark Swiss/Brutalist aesthetic.

## Tested
8/8 backend pytest tests pass. Frontend end-to-end flow validated by testing agent (convert → preview → save → history → delete).
