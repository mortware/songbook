import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth0";
import { byTitle, listChordproDocs, listTracks } from "@/lib/songs";

export const dynamic = "force-dynamic";

/** List all tracks that do NOT have a chordpro document yet. */
export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const [tracks, docs] = await Promise.all([listTracks(), listChordproDocs()]);
  const withDocs = new Set(docs.map((d) => d.slug));

  const missing = tracks.filter((t) => !withDocs.has(t.slug)).sort(byTitle);

  return NextResponse.json(missing);
}
