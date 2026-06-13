import { randomUUID } from "crypto";
import { chordproContainer, tracksContainer } from "./cosmos";
import type { ChordproDoc, TrackMeta } from "./types";

const TRACK_FIELDS =
  "c.slug, c.title, c.artist, c.songKey, c.tempo, c.duration";

export async function listTracks(): Promise<TrackMeta[]> {
  const { resources } = await tracksContainer()
    .items.query<TrackMeta>(
      `SELECT ${TRACK_FIELDS} FROM c WHERE IS_DEFINED(c.slug) AND IS_DEFINED(c.title)`,
    )
    .fetchAll();
  return resources;
}

export async function getTrack(slug: string): Promise<TrackMeta | null> {
  const { resources } = await tracksContainer()
    .items.query<TrackMeta>({
      query: `SELECT ${TRACK_FIELDS} FROM c WHERE c.slug = @slug`,
      parameters: [{ name: "@slug", value: slug }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

export async function listChordproDocs(): Promise<ChordproDoc[]> {
  const { resources } = await chordproContainer()
    .items.query<ChordproDoc>("SELECT * FROM c")
    .fetchAll();
  return resources;
}

export async function getChordproDoc(slug: string): Promise<ChordproDoc | null> {
  const { resources } = await chordproContainer()
    .items.query<ChordproDoc>({
      query: "SELECT * FROM c WHERE c.slug = @slug",
      parameters: [{ name: "@slug", value: slug }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

export async function upsertChordpro(
  slug: string,
  content: string,
): Promise<ChordproDoc> {
  const now = new Date().toISOString();
  const existing = await getChordproDoc(slug);
  if (existing) {
    const updated: ChordproDoc = { ...existing, content, updatedAt: now };
    await chordproContainer().item(existing.id, slug).replace(updated);
    return updated;
  }
  const doc: ChordproDoc = {
    id: randomUUID(),
    slug,
    content,
    createdAt: now,
    updatedAt: now,
  };
  await chordproContainer().items.create(doc);
  return doc;
}

export async function deleteChordpro(slug: string): Promise<boolean> {
  const existing = await getChordproDoc(slug);
  if (!existing) return false;
  await chordproContainer().item(existing.id, slug).delete();
  return true;
}

export function byTitle(a: { title: string }, b: { title: string }): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}
