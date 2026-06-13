import Dexie, { type Table } from "dexie";
import type { Playlist, SyncSong } from "./types";

class SongbookDB extends Dexie {
  songs!: Table<SyncSong, string>;
  playlists!: Table<Playlist, string>;

  constructor() {
    super("songbook");
    this.version(1).stores({
      songs: "slug, title",
    });
    this.version(2).stores({
      songs: "slug, title",
      playlists: "id, createdAt",
    });
    this.version(3)
      .stores({
        songs: "slug, title",
        playlists: "id, createdAt",
      })
      .upgrade((tx) =>
        tx
          .table("playlists")
          .toCollection()
          .modify((pl: Record<string, unknown>) => {
            if (Array.isArray(pl.slugs) && !pl.items) {
              pl.items = (pl.slugs as string[]).map((slug) => ({
                type: "song",
                slug,
              }));
              delete pl.slugs;
            }
          }),
      );
  }
}

export const db = new SongbookDB();
