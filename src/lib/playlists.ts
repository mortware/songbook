import { playlistsContainer } from "./cosmos";
import type { Playlist } from "./types";

export async function listPlaylists(): Promise<Playlist[]> {
  const { resources } = await playlistsContainer()
    .items.query<Playlist>(
      "SELECT * FROM c ORDER BY c.createdAt DESC",
    )
    .fetchAll();
  return resources;
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  try {
    const { resource } = await playlistsContainer()
      .item(id, id)
      .read<Playlist>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function upsertPlaylist(playlist: Playlist): Promise<Playlist> {
  const doc = { ...playlist, updatedAt: new Date().toISOString() };
  await playlistsContainer().items.upsert(doc);
  return doc;
}

export async function deletePlaylist(id: string): Promise<boolean> {
  try {
    await playlistsContainer().item(id, id).delete();
    return true;
  } catch {
    return false;
  }
}
