// Shared types, constants, and pure helpers for the AURAL/MP3 app.

export type Conversion = {
  id: string;
  url: string;
  title: string;
  artist?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  filename: string;
  size_bytes: number;
  created_at: string;
};

export const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export const FALLBACK_ART =
  "https://images.unsplash.com/photo-1580656449278-e8381933522c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwxfHx2aW55bCUyMHJlY29yZCUyMGFic3RyYWN0fGVufDB8fHx8MTc3OTUyMTgwNnww&ixlib=rb-4.1.0&q=85";

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(b: number): string {
  if (!b) return "0 KB";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function safeFilename(title: string | undefined | null): string {
  return (
    (title || "audio")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .slice(0, 80) || "audio"
  );
}
