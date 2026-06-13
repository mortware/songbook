import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth0";
import { byTitle, listChordproDocs, listTracks } from "@/lib/songs";
import type { SongSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** List all tracks that have a chordpro document. */
export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const [tracks, docs] = await Promise.all([listTracks(), listChordproDocs()]);
  const docsBySlug = new Map(docs.map((d) => [d.slug, d]));

  const songs: SongSummary[] = tracks
    .filter((t) => docsBySlug.has(t.slug))
    .map((t) => ({ ...t, updatedAt: docsBySlug.get(t.slug)!.updatedAt }))
    .sort(byTitle);

  return NextResponse.json(songs);
}
