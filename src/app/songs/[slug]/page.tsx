"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ChordProView from "@/components/ChordProView";
import { useSync } from "@/components/SyncProvider";
import { parseChordPro } from "@/lib/chordpro/parser";
import { db } from "@/lib/db";
import { useSlugFromLocation, useSwipeNav, useWakeLock } from "@/lib/hooks";
import type { PlaylistSongItem, SongDetail } from "@/lib/types";

const MIN_FONT = 11;
const MAX_FONT = 36;
const DEFAULT_FONT = 18;

const fontKey = (slug: string) => `songbook:fontSize:${slug}`;
const TWO_COL_KEY = "songbook:twoCol";

export default function SongPage() {
  const slug = useSlugFromLocation();
  const { online } = useSync();
  useWakeLock();

  const allSongs = useLiveQuery(
    () => db.songs.orderBy("title").toArray(),
    [],
  );
  const sortedSlugs = useMemo(
    () => (allSongs ?? []).map((s) => s.slug),
    [allSongs],
  );
  const currentIdx = slug ? sortedSlugs.indexOf(slug) : -1;
  const prevSlug = currentIdx > 0 ? (sortedSlugs[currentIdx - 1] ?? null) : null;
  const nextSlug = currentIdx >= 0 && currentIdx < sortedSlugs.length - 1
    ? (sortedSlugs[currentIdx + 1] ?? null)
    : null;
  useSwipeNav(prevSlug, nextSlug);

  // undefined = loading, null = not in IndexedDB
  const song = useLiveQuery(
    async () => (slug ? ((await db.songs.get(slug)) ?? null) : undefined),
    [slug],
  );

  // If the song isn't synced locally but we're online, fetch it directly
  // (covers opening a song URL on a fresh device before sync finishes).
  const fetchTried = useRef(false);
  useEffect(() => {
    if (song !== null || !slug || fetchTried.current || !navigator.onLine)
      return;
    fetchTried.current = true;
    fetch(`/api/songs/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const detail = (await res.json()) as SongDetail;
        if (detail.content) {
          await db.songs.put({
            slug: detail.slug,
            title: detail.title,
            artist: detail.artist,
            songKey: detail.songKey,
            tempo: detail.tempo,
            duration: detail.duration,
            content: detail.content,
            updatedAt: detail.updatedAt ?? new Date().toISOString(),
          });
        }
      })
      .catch(() => {});
  }, [song, slug]);

  const parsed = useMemo(
    () => (song?.content ? parseChordPro(song.content) : null),
    [song?.content],
  );

  const [fromListId, setFromListId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [needsAutoFit, setNeedsAutoFit] = useState(false);
  const [twoCol, setTwoCol] = useState(false);
  const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);
  const [addedToId, setAddedToId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFromListId(params.get("list"));
  }, []);

  const playlists = useLiveQuery(() => db.playlists.orderBy("createdAt").reverse().toArray(), []);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setTwoCol(localStorage.getItem(TWO_COL_KEY) === "1"); } catch {}
  }, []);

  useEffect(() => {
    if (!slug) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(fontKey(slug));
    } catch {}
    if (stored && Number(stored) >= MIN_FONT) {
      setFontSize(Number(stored));
    } else {
      setFontSize(DEFAULT_FONT);
      setNeedsAutoFit(true);
    }
  }, [slug]);

  // Auto-fit: shrink so the widest tab block fits the viewport width.
  useLayoutEffect(() => {
    if (!needsAutoFit || !parsed || fontSize === null) return;
    const el = contentRef.current;
    if (!el) return;
    let scale = 1;
    el.querySelectorAll("pre").forEach((pre) => {
      if (pre.scrollWidth > pre.clientWidth) {
        scale = Math.min(scale, pre.clientWidth / pre.scrollWidth);
      }
    });
    setNeedsAutoFit(false);
    if (scale < 1) {
      setFontSize(Math.max(MIN_FONT, Math.floor(fontSize * scale)));
    }
  }, [needsAutoFit, parsed, fontSize]);

  const adjustFont = (delta: number) => {
    setFontSize((current) => {
      const next = Math.min(
        MAX_FONT,
        Math.max(MIN_FONT, (current ?? DEFAULT_FONT) + delta),
      );
      if (slug) {
        try {
          localStorage.setItem(fontKey(slug), String(next));
        } catch {}
      }
      return next;
    });
  };

  if (!slug || song === undefined) {
    return <div className="page-message">Loading…</div>;
  }

  if (song === null) {
    return (
      <div className="page-message">
        <p>
          {online
            ? "Song not found."
            : "This song isn't synced to this device, and you're offline."}
        </p>
        <Link className="btn" href="/">
          Back to songs
        </Link>
      </div>
    );
  }

  const parsedKey = parsed?.key;
  const key =
    song.songKey && parsedKey && song.songKey !== parsedKey
      ? `${song.songKey} → ${parsedKey}`
      : (song.songKey ?? parsedKey);
  const bpm = song.tempo?.bpm
    ? `${song.tempo.variable || !Number.isInteger(song.tempo.bpm) ? "~" : ""}${song.tempo.bpm} bpm`
    : null;
  const metaParts = [
    song.artist,
    key && `Key ${key}`,
    bpm,
    song.duration,
    parsed?.capo && `Capo ${parsed.capo}`,
  ].filter(Boolean);

  return (
    <div className="page">
      <header className="song-header">
        <Link
          href={fromListId ? `/playlists/${encodeURIComponent(fromListId)}` : "/"}
          className="btn btn--ghost song-header__back"
          aria-label={fromListId ? "Back to playlist" : "Back to song list"}
        >
          ‹
        </Link>
        <div className="song-header__titles">
          <h1>{song.title}</h1>
          <p>{metaParts.join(" · ")}</p>
        </div>
        <div className="song-header__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => adjustFont(-1)}
            aria-label="Decrease font size"
          >
            A−
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => adjustFont(1)}
            aria-label="Increase font size"
          >
            A+
          </button>
          <button
            type="button"
            className={`btn btn--ghost${twoCol ? " btn--active" : ""}`}
            onClick={() => {
              const next = !twoCol;
              setTwoCol(next);
              try { localStorage.setItem(TWO_COL_KEY, next ? "1" : "0"); } catch {}
            }}
            aria-label="Toggle two-column layout"
            title="Two columns"
          >
            ⊟
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => { setShowPlaylistSheet(true); setAddedToId(null); }}
            aria-label="Add to playlist"
            title="Add to playlist"
          >
            ♪
          </button>
          {online ? (
            <Link
              className="btn"
              href={`/songs/${encodeURIComponent(slug)}/edit`}
            >
              Edit
            </Link>
          ) : (
            <span className="btn btn--disabled" title="Editing is unavailable offline">
              Edit
            </span>
          )}
        </div>
      </header>

      <main
        className={`song-content${twoCol ? " song-content--two-col" : ""}`}
        ref={contentRef}
        style={{ "--song-font-size": `${fontSize ?? DEFAULT_FONT}px` } as React.CSSProperties}
      >
        {parsed && <ChordProView song={parsed} />}
      </main>

      {showPlaylistSheet && (
        <div className="info-overlay" onClick={() => setShowPlaylistSheet(false)}>
          <div className="info-panel" onClick={(e) => e.stopPropagation()}>
            <div className="info-panel__header">
              <h2 className="info-panel__title">Add to playlist</h2>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowPlaylistSheet(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {!playlists || playlists.length === 0 ? (
              <div className="info-panel__row">
                <span className="info-panel__label">No playlists yet.</span>
                <Link className="btn btn--ghost song-add-playlist-link" href="/playlists">
                  Create one
                </Link>
              </div>
            ) : (
              playlists.map((pl) => {
                const items = pl.items ?? [];
                const already = items.some((i) => i.type === "song" && i.slug === slug);
                const added = addedToId === pl.id;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    className="info-panel__row info-panel__row--btn"
                    disabled={already}
                    onClick={async () => {
                      const newItem: PlaylistSongItem = { type: "song", slug };
                      const newItems = [...items, newItem];
                      const updatedAt = new Date().toISOString();
                      await db.playlists.update(pl.id, { items: newItems, updatedAt });
                      if (navigator.onLine) {
                        fetch(`/api/playlists/${encodeURIComponent(pl.id)}`, {
                          method: "PUT",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ ...pl, items: newItems, updatedAt }),
                        }).catch(() => {});
                      }
                      setAddedToId(pl.id);
                    }}
                  >
                    <span className="info-panel__label">{pl.name}</span>
                    <span className="info-panel__value">
                      {already ? "✓" : added ? "Added!" : "+"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
