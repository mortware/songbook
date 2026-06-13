import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth0";
import {
  deleteChordpro,
  getChordproDoc,
  getTrack,
  upsertChordpro,
} from "@/lib/songs";
import type { SongDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_CONTENT_LENGTH = 500_000;

type Params = { params: Promise<{ slug: string }> };

/** Song metadata + chordpro content (content is null if no doc yet). */
export async function GET(_request: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { slug } = await params;
  const [track, doc] = await Promise.all([getTrack(slug), getChordproDoc(slug)]);
  if (!track && !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const detail: SongDetail = {
    slug,
    title: track?.title ?? slug,
    artist: track?.artist,
    songKey: track?.songKey,
    tempo: track?.tempo,
    duration: track?.duration,
    content: doc?.content ?? null,
    updatedAt: doc?.updatedAt ?? null,
  };
  return NextResponse.json(detail);
}

/** Create or update the chordpro document for a track. */
export async function PUT(request: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { slug } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const content = (body as { content?: unknown })?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "content must be a non-empty string" },
      { status: 400 },
    );
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "content too large" }, { status: 413 });
  }

  const track = await getTrack(slug);
  if (!track) {
    return NextResponse.json(
      { error: `No track with slug "${slug}"` },
      { status: 404 },
    );
  }

  const doc = await upsertChordpro(slug, content);
  // Return the same shape the sync endpoint uses so the client can
  // write it straight into IndexedDB.
  return NextResponse.json({
    ...track,
    content: doc.content,
    updatedAt: doc.updatedAt,
  });
}

/** Delete the chordpro document for a track. */
export async function DELETE(_request: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { slug } = await params;
  const deleted = await deleteChordpro(slug);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
