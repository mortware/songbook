import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth0";
import { byTitle, listChordproDocs, listTracks } from "@/lib/songs";
import type { SyncSong } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Extract a {title:} directive as a fallback when a doc has no track. */
function titleFromContent(content: string): string | null {
  const match = content.match(/^\{\s*(?:title|t)\s*:\s*(.+?)\s*\}\s*$/im);
  return match ? match[1] : null;
}

/** All chordpro documents joined with track metadata, for offline sync. */
export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const [tracks, docs] = await Promise.all([listTracks(), listChordproDocs()]);
  const tracksBySlug = new Map(tracks.map((t) => [t.slug, t]));

  const songs: SyncSong[] = docs
    .map((doc) => {
      const track = tracksBySlug.get(doc.slug);
      return {
        slug: doc.slug,
        title: track?.title ?? titleFromContent(doc.content) ?? doc.slug,
        artist: track?.artist,
        songKey: track?.songKey,
        tempo: track?.tempo,
        duration: track?.duration,
        content: doc.content,
        updatedAt: doc.updatedAt,
      };
    })
    .sort(byTitle);

  return NextResponse.json(songs);
}
