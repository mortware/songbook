import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth0";
import { deletePlaylist, getPlaylist, upsertPlaylist } from "@/lib/playlists";
import type { Playlist } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const playlist = await getPlaylist(id);
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(playlist);
}

export async function PUT(request: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = body as Partial<Playlist>;
  if (!patch.name || !patch.type || !Array.isArray(patch.items)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const existing = await getPlaylist(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const saved = await upsertPlaylist({ ...existing, ...patch, id });
  return NextResponse.json(saved);
}

export async function DELETE(_req: Request, { params }: Params) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const deleted = await deletePlaylist(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
