import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth0";
import { listPlaylists, upsertPlaylist } from "@/lib/playlists";
import type { Playlist } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const playlists = await listPlaylists();
  return NextResponse.json(playlists);
}

export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pl = body as Partial<Playlist>;
  if (!pl.id || !pl.name || !pl.type || !Array.isArray(pl.items)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const saved = await upsertPlaylist(pl as Playlist);
  return NextResponse.json(saved, { status: 201 });
}
