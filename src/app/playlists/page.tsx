"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import type { Playlist, PlaylistItem, PlaylistType } from "@/lib/types";

const TYPE_LABELS: Record<PlaylistType, string> = {
  gig: "Gig",
  rehearsal: "Rehearsal",
  practice: "Practice",
  other: "Other",
};

function songCount(items: PlaylistItem[]): number {
  return items.filter((i) => i.type === "song").length;
}

function makePlaylistName(type: PlaylistType): string {
  const d = new Date().toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${TYPE_LABELS[type]} · ${d}`;
}

interface ContextMenu {
  id: string;
  x: number;
  y: number;
}

export default function PlaylistsPage() {
  const router = useRouter();
  const playlists = useLiveQuery(
    () => db.playlists.orderBy("createdAt").reverse().toArray(),
    [],
  );
  const [creating, setCreating] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const pressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    contextMenuRef.current.style.top = `${contextMenu.y}px`;
    contextMenuRef.current.style.left = `${contextMenu.x}px`;
  }, [contextMenu]);

  // Sync from server on mount
  useEffect(() => {
    if (!navigator.onLine) return;
    fetch("/api/playlists")
      .then(async (res) => {
        if (!res.ok) return;
        const remote = (await res.json()) as Playlist[];
        await db.transaction("rw", db.playlists, async () => {
          for (const pl of remote) {
            const local = await db.playlists.get(pl.id);
            if (!local || (pl.updatedAt && pl.updatedAt > (local.updatedAt ?? ""))) {
              await db.playlists.put(pl);
            }
          }
        });
      })
      .catch(() => {});
  }, []);

  const startPress = (id: string, x: number, y: number) => {
    longPressedRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      pressTimerRef.current = null;
      setContextMenu({ id, x, y });
    }, 500);
  };

  const cancelPress = () => {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const create = async (type: PlaylistType) => {
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name: makePlaylistName(type),
      type,
      createdAt: new Date().toISOString(),
      items: [],
    };
    await db.playlists.add(playlist);
    setCreating(false);
    if (navigator.onLine) {
      fetch("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playlist),
      }).catch(() => {});
    }
  };

  const duplicatePlaylist = async (id: string) => {
    const original = await db.playlists.get(id);
    if (!original) return;
    const now = new Date().toISOString();
    const copy: Playlist = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    await db.playlists.add(copy);
    if (navigator.onLine) {
      fetch("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(copy),
      }).catch(() => {});
    }
    setContextMenu(null);
  };

  return (
    <div className="page">
      <header className="app-header">
        <Link href="/" className="btn btn--ghost song-header__back" aria-label="Back">
          ‹
        </Link>
        <h1>Playlists</h1>
        <div className="app-header__spacer" />
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setCreating(true)}
        >
          + New
        </button>
      </header>

      <main className="song-list">
        {playlists === undefined ? (
          <p className="empty-state">Loading…</p>
        ) : playlists.length === 0 ? (
          <p className="empty-state">No playlists yet. Tap "+ New" to create one.</p>
        ) : (
          playlists.map((pl) => (
            <div
              key={pl.id}
              className="song-row"
              onMouseDown={(e) => startPress(pl.id, e.clientX, e.clientY)}
              onTouchStart={(e) => startPress(pl.id, e.touches[0].clientX, e.touches[0].clientY)}
              onMouseMove={cancelPress}
              onTouchMove={cancelPress}
              onMouseLeave={cancelPress}
              onMouseUp={cancelPress}
              onTouchEnd={cancelPress}
              onClick={() => {
                if (longPressedRef.current) {
                  longPressedRef.current = false;
                } else {
                  router.push(`/playlists/${encodeURIComponent(pl.id)}`);
                }
              }}
            >
              <span className="song-row__main">
                <span className="song-row__title">{pl.name}</span>
                <span className="song-row__artist">
                  {songCount(pl.items)} {songCount(pl.items) === 1 ? "track" : "tracks"}
                </span>
              </span>
              <span className="song-row__meta">
                <span className="playlist-type-badge">
                  {TYPE_LABELS[pl.type]}
                </span>
              </span>
            </div>
          ))
        )}
      </main>

      {creating && (
        <div className="info-overlay" onClick={() => setCreating(false)}>
          <div className="info-panel" onClick={(e) => e.stopPropagation()}>
            <div className="info-panel__header">
              <h2 className="info-panel__title">What kind of playlist?</h2>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setCreating(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {(["gig", "rehearsal", "practice", "other"] as PlaylistType[]).map((t) => (
              <button
                key={t}
                type="button"
                className="info-panel__row info-panel__row--btn"
                onClick={() => create(t)}
              >
                <span className="info-panel__label">{TYPE_LABELS[t]}</span>
                <span className="info-panel__value">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {contextMenu && (
        <>
          <div className="menu-overlay" onClick={() => setContextMenu(null)} />
          <div
            ref={contextMenuRef}
            className="context-menu"
          >
            <button
              type="button"
              className="dropdown-menu__item"
              onClick={() => duplicatePlaylist(contextMenu.id)}
            >
              Duplicate playlist
            </button>
            <button
              type="button"
              className="dropdown-menu__item"
              onClick={() => setContextMenu(null)}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
