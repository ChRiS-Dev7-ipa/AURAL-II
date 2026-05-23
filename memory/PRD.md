# PRD — AURAL / MP3 (Audio URL → MP3 Converter)

## Goal
Mobile app that converts an audio URL (SoundCloud, YouTube, Bandcamp, Vimeo, direct .mp3/.wav/.m4a/.ogg/.flac links, etc.) into a 192 kbps MP3 file and saves it to the iPhone Files app via the iOS share sheet.

## Stack
- **Frontend:** Expo SDK 54 (React Native), expo-router file-based routes
- **Backend:** FastAPI + Motor (MongoDB)
- **Audio pipeline:** `yt-dlp` for source resolution + `ffmpeg` (libmp3lame, 192 kbps) for transcoding; urllib fallback for direct audio file URLs

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
Single screen (`/app/frontend/app/index.tsx`):
- Headline **AUDIO TO MP3** with Signal Red (#FF3B30) accent
- Bottom-docked URL input + clipboard paste shortcut + **CONVERT TO MP3** button (loading "CONVERTING…" state)
- Recent conversions list (thumbnail, title, artist · duration · size, delete button)
- **Player modal** (bottom sheet, scrollable, max 92% height): album art, title/meta, progress bar, play/pause + ±10s seek (`expo-audio` `useAudioPlayer`), and **SAVE TO FILES** button that triggers `expo-sharing` → iOS share sheet → Save to Files
- Outfit (headings) + JetBrains Mono (metadata) fonts, dark Swiss/Brutalist aesthetic

## Tested
8/8 backend pytest tests pass. Frontend end-to-end flow validated by testing agent (convert → preview → save → history → delete).
