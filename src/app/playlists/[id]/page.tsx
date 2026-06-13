"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import type { Playlist, PlaylistItem, PlaylistSongItem } from "@/lib/types";

function useIdFromLocation(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const match = window.location.pathname.match(/^\/playlists\/([^/]+)/);
    setId(match ? decodeURIComponent(match[1]) : null);
  }, []);
  return id;
}

function songNumber(items: PlaylistItem[], upToIdx: number): number {
  let n = 0;
  for (let i = 0; i <= upToIdx; i++) {
    if (items[i].type === "song") n++;
  }
  return n;
}

export default function PlaylistDetailPage() {
  const id = useIdFromLocation();
  const router = useRouter();

  const playlist = useLiveQuery(
    async () => (id ? ((await db.playlists.get(id)) ?? null) : undefined),
    [id],
  );

  const songs = useLiveQuery(() => db.songs.toArray(), []);
  const songsBySlug = useMemo(
    () => new Map((songs ?? []).map((s) => [s.slug, s])),
    [songs],
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Touch drag state
  const touchFromIdx = useRef<number | null>(null);
  const touchToIdx = useRef<number>(0);

  useEffect(() => {
    if (playlist?.name) setName(playlist.name);
  }, [playlist?.name]);

  // Sync from server on mount
  useEffect(() => {
    if (!id || !navigator.onLine) return;
    fetch(`/api/playlists/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const pl = (await res.json()) as Playlist;
        const local = await db.playlists.get(id);
        if (!local || (pl.updatedAt && pl.updatedAt > (local.updatedAt ?? ""))) {
          await db.playlists.put(pl);
        }
      })
      .catch(() => {});
  }, [id]);

  // Global touch move/end listeners when dragging
  useEffect(() => {
    if (draggingIdx === null) return;

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = el?.closest("[data-item-idx]") as HTMLElement | null;
      if (row?.dataset.itemIdx !== undefined) {
        const idx = parseInt(row.dataset.itemIdx, 10);
        if (!isNaN(idx)) {
          touchToIdx.current = idx;
          setDragOverIdx(idx);
        }
      }
    };

    const onTouchEnd = () => {
      if (touchFromIdx.current !== null) {
        commitReorder(touchFromIdx.current, touchToIdx.current);
        touchFromIdx.current = null;
      }
      setDraggingIdx(null);
      setDragOverIdx(null);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingIdx]);

  if (!id || playlist === undefined) return <div className="page-message">Loading…</div>;
  if (playlist === null) {
    return (
      <div className="page-message">
        <p>Playlist not found.</p>
        <Link className="btn" href="/playlists">Back to playlists</Link>
      </div>
    );
  }

  const items = playlist.items ?? [];

  const saveItems = async (newItems: PlaylistItem[]) => {
    const updatedAt = new Date().toISOString();
    await db.playlists.update(id, { items: newItems, updatedAt });
    if (navigator.onLine) {
      fetch(`/api/playlists/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...playlist, items: newItems, updatedAt }),
      }).catch(() => {});
    }
  };

  const commitReorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const newItems = [...items];
    const [moved] = newItems.splice(fromIdx, 1);
    newItems.splice(toIdx, 0, moved);
    void saveItems(newItems);
  };

  const removeItem = (idx: number) => {
    void saveItems(items.filter((_, i) => i !== idx));
  };

  const toggleSegue = (idx: number) => {
    const newItems = items.map((item, i) => {
      if (i !== idx || item.type !== "song") return item;
      return { ...item, segueNext: !item.segueNext };
    }) as PlaylistItem[];
    void saveItems(newItems);
  };

  const addBreak = () => {
    void saveItems([...items, { type: "break", id: crypto.randomUUID() }]);
  };

  const saveName = async () => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    const updatedAt = new Date().toISOString();
    await db.playlists.update(id, { name: trimmed, updatedAt });
    setEditing(false);
    if (navigator.onLine) {
      fetch(`/api/playlists/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...playlist, name: trimmed, updatedAt }),
      }).catch(() => {});
    }
  };

  const deletePlaylist = async () => {
    if (!window.confirm("Delete this playlist?")) return;
    await db.playlists.delete(id);
    if (navigator.onLine) {
      fetch(`/api/playlists/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    router.push("/playlists");
  };

  return (
    <div className="page">
      <header className="song-header">
        <Link href="/playlists" className="btn btn--ghost song-header__back" aria-label="Back">
          ‹
        </Link>
        <div className="song-header__titles">
          {editing ? (
            <input
              className="playlist-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              aria-label="Playlist name"
              title="Playlist name"
              autoFocus
            />
          ) : (
            <h1 onClick={() => setEditing(true)} title="Tap to rename" className="playlist-title-editable">
              {playlist.name}
            </h1>
          )}
          <p>
            {items.filter((i) => i.type === "song").length}{" "}
            {items.filter((i) => i.type === "song").length === 1 ? "track" : "tracks"}
          </p>
        </div>
        <div className="song-header__actions">
          <button
            type="button"
            className="btn btn--danger-ghost"
            onClick={deletePlaylist}
          >
            Delete
          </button>
        </div>
      </header>

      <main className="song-list">
        {items.length === 0 ? (
          <p className="empty-state">
            No tracks yet. Open a song and tap ♪ to add it here.
          </p>
        ) : (
          items.map((item, i) => {
            const isDragging = draggingIdx === i;
            const isOver = dragOverIdx === i && draggingIdx !== i;
            const rowClass = [
              "song-row",
              "playlist-item-row",
              isDragging ? "playlist-item-row--dragging" : "",
              isOver ? "playlist-item-row--drag-over" : "",
            ]
              .filter(Boolean)
              .join(" ");

            if (item.type === "break") {
              return (
                <div
                  key={item.id}
                  className={rowClass}
                  data-item-idx={i}
                  draggable
                  onDragStart={() => { setDraggingIdx(i); setDragOverIdx(i); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                  onDrop={() => { commitReorder(draggingIdx ?? i, i); setDraggingIdx(null); setDragOverIdx(null); }}
                  onDragEnd={() => { setDraggingIdx(null); setDragOverIdx(null); }}
                >
                  <span
                    className="drag-handle"
                    onTouchStart={() => { touchFromIdx.current = i; touchToIdx.current = i; setDraggingIdx(i); }}
                  >
                    ≡
                  </span>
                  <span className="playlist-break-label">— Set Break —</span>
                  <button
                    type="button"
                    className="btn btn--ghost playlist-remove-btn"
                    onClick={() => removeItem(i)}
                    aria-label="Remove break"
                  >
                    ✕
                  </button>
                </div>
              );
            }

            // Song item
            const songItem = item as PlaylistSongItem;
            const song = songsBySlug.get(songItem.slug);
            const nextItem = items[i + 1];
            const canSegue = nextItem?.type === "song";

            return (
              <div key={songItem.slug + i} data-item-idx={i}>
                <div
                  className={rowClass}
                  draggable
                  onDragStart={() => { setDraggingIdx(i); setDragOverIdx(i); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                  onDrop={() => { commitReorder(draggingIdx ?? i, i); setDraggingIdx(null); setDragOverIdx(null); }}
                  onDragEnd={() => { setDraggingIdx(null); setDragOverIdx(null); }}
                >
                  <span
                    className="drag-handle"
                    onTouchStart={() => { touchFromIdx.current = i; touchToIdx.current = i; setDraggingIdx(i); }}
                  >
                    ≡
                  </span>
                  <span className="playlist-track-num">{songNumber(items, i)}</span>
                  <span className="song-row__main">
                    {song ? (
                      <>
                        <Link
                          href={`/songs/${encodeURIComponent(songItem.slug)}?list=${encodeURIComponent(id)}`}
                          className="song-row__title"
                        >
                          {song.title}
                        </Link>
                        <span className="song-row__artist">{song.artist}</span>
                      </>
                    ) : (
                      <span className="song-row__title">{songItem.slug}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost playlist-remove-btn"
                    onClick={() => removeItem(i)}
                    aria-label="Remove from playlist"
                  >
                    ✕
                  </button>
                </div>
                {canSegue && (
                  <button
                    type="button"
                    className={`segue-btn${songItem.segueNext ? " segue-btn--active" : ""}`}
                    onClick={() => toggleSegue(i)}
                    title={songItem.segueNext ? "Segue: tap to remove" : "Tap to add segue"}
                  >
                    {songItem.segueNext ? "⤵ Segue" : "· · ·"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </main>

      <div className="playlist-footer">
        <button type="button" className="btn btn--ghost" onClick={addBreak}>
          + Add Break
        </button>
      </div>
    </div>
  );
}
