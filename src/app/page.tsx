"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { themeLabel, useTheme } from "@/components/ThemeProvider";
import { db } from "@/lib/db";
import type { TrackMeta } from "@/lib/types";

type SortBy = "title" | "artist";

function formatTempo(track: TrackMeta): string | null {
  if (!track.tempo?.bpm) return null;
  const approx = track.tempo.variable || !Number.isInteger(track.tempo.bpm);
  return `${approx ? "~" : ""}${track.tempo.bpm}`;
}

const KEY_RE = /^\{\s*key\s*:\s*(.+?)\s*\}\s*$/im;

function getKeyDisplay(song: { songKey?: string; content?: string }): string | undefined {
  const cpKey = song.content ? (KEY_RE.exec(song.content)?.[1] ?? undefined) : undefined;
  if (song.songKey && cpKey && song.songKey !== cpKey) return `${song.songKey} → ${cpKey}`;
  return song.songKey ?? cpKey;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function groupLetter(track: TrackMeta, sortBy: SortBy): string {
  const raw = sortBy === "artist"
    ? (track.artist?.[0] ?? "")
    : (track.title[0] ?? "");
  const up = raw.toUpperCase();
  return /^[A-Z]$/.test(up) ? up : "#";
}

function matchesQuery(track: TrackMeta, needle: string): boolean {
  return (
    track.title.toLowerCase().includes(needle) ||
    (track.artist ?? "").toLowerCase().includes(needle)
  );
}

interface StorageInfo {
  songCount: number;
  storageUsed: number | null;
  storageQuota: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HomePage() {
  const { theme, cycleTheme } = useTheme();
  const { online, status, lastSync, error, refresh } = useSync();
  const songs = useLiveQuery(() => db.songs.toArray(), []);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("title");
  const [missing, setMissing] = useState<TrackMeta[] | null>(null);
  const [missingError, setMissingError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [azPreview, setAzPreview] = useState<string | null>(null);

  // Refs for the A-Z indexer — event listeners are native (non-passive) to allow preventDefault
  const azNavRef = useRef<HTMLElement>(null);
  const azInnerRef = useRef<HTMLDivElement>(null);
  const azPreviewRef = useRef<string | null>(null);

  const sorted = useMemo(
    () =>
      (songs ?? [])
        .slice()
        .sort((a, b) => {
          if (sortBy === "artist") {
            const aA = a.artist ?? "";
            const bA = b.artist ?? "";
            if (!aA && bA) return 1;
            if (aA && !bA) return -1;
            const cmp = aA.localeCompare(bA, undefined, { sensitivity: "base" });
            if (cmp !== 0) return cmp;
          }
          return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        }),
    [songs, sortBy],
  );

  const letterSet = useMemo(() => {
    const s = new Set<string>();
    for (const song of sorted) s.add(groupLetter(song, sortBy));
    return s;
  }, [sorted, sortBy]);

  const needle = query.trim().toLowerCase();
  const visible = needle ? sorted.filter((s) => matchesQuery(s, needle)) : sorted;
  const showIndexer = !needle && sorted.length > 0;

  const visibleMissing = needle
    ? (missing ?? []).filter((s) => matchesQuery(s, needle))
    : (missing ?? []);

  // Auto-fetch missing tracks when searching while online
  useEffect(() => {
    if (!needle || !online) {
      setMissing(null);
      setMissingError(null);
      return;
    }
    if (missing !== null) return;
    fetch("/api/songs/without-chordpro")
      .then(async (res) => {
        if (res.status === 401) { window.location.href = "/auth/login"; return; }
        if (!res.ok) { setMissingError(`Failed to load (${res.status})`); return; }
        setMissing((await res.json()) as TrackMeta[]);
      })
      .catch(() => setMissingError("Failed to load"));
  }, [needle, online, missing]);

  // ---- A-Z index: native non-passive touch listeners to allow preventDefault ----
  useEffect(() => {
    const nav = azNavRef.current;
    const inner = azInnerRef.current;
    if (!nav || !inner) return;

    const getLetterAt = (clientY: number): string | null => {
      const el = azInnerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const y = clientY - rect.top;
      const idx = Math.floor((y / rect.height) * LETTERS.length);
      return LETTERS[Math.max(0, Math.min(LETTERS.length - 1, idx))] ?? null;
    };

    const jump = (letter: string, smooth = false) => {
      document
        .querySelector(`[data-letter="${letter}"]`)
        ?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const letter = getLetterAt(e.touches[0].clientY);
      azPreviewRef.current = letter;
      setAzPreview(letter);
      if (letter) jump(letter);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const letter = getLetterAt(e.touches[0].clientY);
      if (letter !== azPreviewRef.current) {
        azPreviewRef.current = letter;
        setAzPreview(letter);
        if (letter) jump(letter);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      azPreviewRef.current = null;
      setAzPreview(null);
    };

    const onClick = (e: MouseEvent) => {
      const letter = getLetterAt(e.clientY);
      if (letter) jump(letter, true);
    };

    nav.addEventListener("touchstart", onTouchStart, { passive: false });
    nav.addEventListener("touchmove", onTouchMove, { passive: false });
    nav.addEventListener("touchend", onTouchEnd, { passive: false });
    nav.addEventListener("click", onClick);
    return () => {
      nav.removeEventListener("touchstart", onTouchStart);
      nav.removeEventListener("touchmove", onTouchMove);
      nav.removeEventListener("touchend", onTouchEnd);
      nav.removeEventListener("click", onClick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — handlers only close over refs

  // ---- Info panel ----
  const openInfo = () => {
    setShowInfo(true);
    const run = async () => {
      const songCount = await db.songs.count();
      let storageUsed: number | null = null;
      let storageQuota: number | null = null;
      try {
        const est = await navigator.storage.estimate();
        storageUsed = est.usage ?? null;
        storageQuota = est.quota ?? null;
      } catch {}
      setStorageInfo({ songCount, storageUsed, storageQuota });
    };
    void run();
  };

  // ---- Status text ----
  let statusText: string;
  if (!online) statusText = "Offline";
  else if (status === "syncing") statusText = "Syncing…";
  else if (status === "error") statusText = error ?? "Sync failed";
  else if (lastSync)
    statusText = `Synced ${new Date(lastSync).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  else statusText = "Not synced";

  // ---- Song rows with letter-section headers ----
  const songItems: React.ReactNode[] = [];
  let lastLetter = "";
  for (const song of visible) {
    const letter = groupLetter(song, sortBy);
    if (letter !== lastLetter) {
      lastLetter = letter;
      songItems.push(
        <div key={`hdr-${letter}`} className="song-letter-header" data-letter={letter}>
          {letter}
        </div>,
      );
    }
    const primary = sortBy === "artist" ? (song.artist ?? "Unknown") : song.title;
    const secondary = sortBy === "artist" ? song.title : song.artist;
    songItems.push(
      <Link
        key={song.slug}
        href={`/songs/${encodeURIComponent(song.slug)}`}
        className="song-row"
      >
        <span className="song-row__main">
          <span className="song-row__title">{primary}</span>
          <span className="song-row__artist">{secondary}</span>
        </span>
        <span className="song-row__meta">
          {getKeyDisplay(song) && <span>{getKeyDisplay(song)}</span>}
          {formatTempo(song) && <span>{formatTempo(song)} bpm</span>}
        </span>
      </Link>,
    );
  }

  return (
    <div className="page">
      {/* Sidebar overlay (always in DOM for CSS transitions) */}
      <div
        className={`sidebar-overlay${showMenu ? " sidebar-overlay--visible" : ""}`}
        onClick={() => setShowMenu(false)}
      />

      {/* Sidebar */}
      <div className={`sidebar${showMenu ? " sidebar--open" : ""}`} aria-label="Menu">
        <div className="sidebar__header">
          <span className="sidebar__app-name">Songbook</span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setShowMenu(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="sidebar__nav">
          <p className="sidebar__section-label">Library</p>
          <Link
            className="sidebar__item"
            href="/playlists"
            onClick={() => setShowMenu(false)}
          >
            <span className="sidebar__icon">♫</span>
            Playlists
          </Link>
          <p className="sidebar__section-label">Preferences</p>
          <button
            type="button"
            className="sidebar__item"
            onClick={() => cycleTheme()}
          >
            <span className="sidebar__icon">{themeLabel(theme)}</span>
            Appearance
          </button>
          <p className="sidebar__section-label">Account</p>
          <a className="sidebar__item sidebar__item--danger" href="/auth/logout">
            <span className="sidebar__icon">↩</span>
            Sign Out
          </a>
        </nav>
        <div className="sidebar__footer">
          <button
            type="button"
            className={`sidebar__sync-text${status === "error" ? " sync-status--error" : ""}`}
            onClick={openInfo}
          >
            {statusText}
          </button>
          <button
            type="button"
            className="sidebar__sync-btn"
            onClick={() => { setShowMenu(false); refresh(); }}
            disabled={!online || status === "syncing"}
            title="Sync now"
          >
            ↺
          </button>
        </div>
      </div>

      <header className="app-header">
        <div className="search-wrap">
          <input
            type="search"
            className="search-input"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="sort-seg" role="group" aria-label="Sort order">
          <button
            type="button"
            className={`sort-seg__btn${sortBy === "title" ? " sort-seg__btn--active" : ""}`}
            onClick={() => setSortBy("title")}
          >
            Title
          </button>
          <button
            type="button"
            className={`sort-seg__btn${sortBy === "artist" ? " sort-seg__btn--active" : ""}`}
            onClick={() => setSortBy("artist")}
          >
            Artist
          </button>
        </div>
        <button
          type="button"
          className="btn btn--ghost app-header__menu-btn"
          onClick={() => setShowMenu((v) => !v)}
          aria-label="Open menu"
        >
          ≡
        </button>
      </header>

      <main className={`song-list${showIndexer ? " song-list--indexed" : ""}`}>
        {songs === undefined ? (
          <p className="empty-state">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="empty-state">
            {sorted.length === 0 ? "No songs synced yet." : "No songs match your search."}
          </p>
        ) : (
          songItems
        )}

        {needle && online && (
          <section className="missing-section">
            <h2 className="missing-heading">Without ChordPro</h2>
            {missingError ? (
              <p className="empty-state">{missingError}</p>
            ) : missing === null ? (
              <p className="empty-state">Loading…</p>
            ) : visibleMissing.length === 0 ? null : (
              visibleMissing.map((track) => (
                <Link
                  key={track.slug}
                  href={`/songs/${encodeURIComponent(track.slug)}/edit`}
                  className="song-row song-row--missing"
                >
                  <span className="song-row__main">
                    <span className="song-row__title">{track.title}</span>
                    <span className="song-row__artist">{track.artist}</span>
                  </span>
                  <span className="song-row__add">+ Add</span>
                </Link>
              ))
            )}
          </section>
        )}
      </main>

      {showInfo && (
        <div className="info-overlay" onClick={() => setShowInfo(false)}>
          <div className="info-panel" onClick={(e) => e.stopPropagation()}>
            <div className="info-panel__header">
              <h2 className="info-panel__title">Local Storage</h2>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowInfo(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {storageInfo === null ? (
              <p className="info-panel__row">Loading…</p>
            ) : (
              <>
                <div className="info-panel__row">
                  <span className="info-panel__label">Songs cached</span>
                  <span className="info-panel__value">{storageInfo.songCount}</span>
                </div>
                {storageInfo.storageUsed !== null && (
                  <div className="info-panel__row">
                    <span className="info-panel__label">Storage used</span>
                    <span className="info-panel__value">{formatBytes(storageInfo.storageUsed)}</span>
                  </div>
                )}
                {storageInfo.storageQuota !== null && (
                  <div className="info-panel__row">
                    <span className="info-panel__label">Storage quota</span>
                    <span className="info-panel__value">{formatBytes(storageInfo.storageQuota)}</span>
                  </div>
                )}
                {lastSync && (
                  <div className="info-panel__row">
                    <span className="info-panel__label">Last synced</span>
                    <span className="info-panel__value">
                      {new Date(lastSync).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* A-Z indexer — always in DOM so the useEffect can attach listeners once */}
      <nav
        ref={azNavRef}
        className={`az-index${showIndexer ? "" : " az-index--hidden"}`}
        aria-label="Alphabetical index"

      >
        <div ref={azInnerRef} className="az-index__inner">
          {LETTERS.map((letter) => (
            <span
              key={letter}
              className={[
                "az-index__btn",
                !letterSet.has(letter) ? "az-index__btn--empty" : "",
                azPreview === letter ? "az-index__btn--preview" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            >
              {letter}
            </span>
          ))}
        </div>
      </nav>

      {azPreview && (
        <div className="az-preview" aria-live="polite">
          {azPreview}
        </div>
      )}
    </div>
  );
}
