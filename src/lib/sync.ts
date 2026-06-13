import { db } from "./db";
import type { SyncSong } from "./types";

export const LAST_SYNC_KEY = "songbook:lastSync";

export type SyncResult =
  | { ok: true; count: number }
  | { ok: false; unauthorized?: boolean; error: string };

/**
 * Pull all chordpro documents from the server and mirror them into
 * IndexedDB (removing local songs deleted on the server).
 */
export async function syncNow(): Promise<SyncResult> {
  let response: Response;
  try {
    response = await fetch("/api/sync");
  } catch {
    return { ok: false, error: "Network error" };
  }
  if (response.status === 401) {
    return { ok: false, unauthorized: true, error: "Session expired" };
  }
  if (!response.ok) {
    return { ok: false, error: `Sync failed (${response.status})` };
  }

  const songs = (await response.json()) as SyncSong[];
  await db.transaction("rw", db.songs, async () => {
    const keep = new Set(songs.map((s) => s.slug));
    const existing = (await db.songs.toCollection().primaryKeys()) as string[];
    const stale = existing.filter((slug) => !keep.has(slug));
    if (stale.length > 0) await db.songs.bulkDelete(stale);
    await db.songs.bulkPut(songs);
  });

  try {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    // localStorage unavailable — non-fatal
  }
  return { ok: true, count: songs.length };
}
