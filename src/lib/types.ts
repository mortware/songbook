export type PlaylistType = "gig" | "rehearsal" | "practice" | "other";

export interface PlaylistSongItem {
  type: "song";
  slug: string;
  segueNext?: boolean;
}

export interface PlaylistBreakItem {
  type: "break";
  id: string;
}

export type PlaylistItem = PlaylistSongItem | PlaylistBreakItem;

export interface Playlist {
  id: string;
  name: string;
  type: PlaylistType;
  createdAt: string;
  updatedAt?: string;
  items: PlaylistItem[];
}

export interface TrackTempo {
  bpm?: number;
  variable?: boolean;
}

/** Song identity/metadata — sourced from the existing `tracks` container. */
export interface TrackMeta {
  slug: string;
  title: string;
  artist?: string;
  songKey?: string;
  tempo?: TrackTempo;
  duration?: string;
}

/** Document stored in the `chordpro` container (partition key /slug). */
export interface ChordproDoc {
  id: string;
  slug: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Track metadata + chordpro doc timestamp, as returned by GET /api/songs. */
export interface SongSummary extends TrackMeta {
  updatedAt: string;
}

/** Full song payload for offline sync and local storage in IndexedDB. */
export interface SyncSong extends TrackMeta {
  content: string;
  updatedAt: string;
}

/** GET /api/songs/[slug] — track metadata plus content if a doc exists. */
export interface SongDetail extends TrackMeta {
  content: string | null;
  updatedAt: string | null;
}
