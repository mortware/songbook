"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { db } from "@/lib/db";
import { useSlugFromLocation } from "@/lib/hooks";
import type { SongDetail, SyncSong, TrackMeta } from "@/lib/types";

function newSongTemplate(track: TrackMeta): string {
  const lines = [`{title: ${track.title}}`];
  if (track.artist) lines.push(`{subtitle: ${track.artist}}`);
  return lines.join("\n") + "\n\n";
}

const GUITAR_TAB = `e|------|
B|------|
G|------|
D|------|
A|------|
E|------|`;

const BASS_TAB = `G|------|
D|------|
A|------|
E|------|`;

export default function EditSongPage() {
  const slug = useSlugFromLocation();
  const { online } = useSync();
  const router = useRouter();

  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [hasDoc, setHasDoc] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTabMenu, setShowTabMenu] = useState(false);
  const tabBtnRef = useRef<HTMLButtonElement>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const tabMenuPosRef = useRef<{ top: number; left: number } | null>(null);

  // Position the tab menu before paint to avoid layout flash
  useLayoutEffect(() => {
    if (!showTabMenu || !tabMenuRef.current) return;
    const pos = tabMenuPosRef.current;
    if (!pos) return;
    tabMenuRef.current.style.top = `${pos.top}px`;
    tabMenuRef.current.style.left = `${pos.left}px`;
  }, [showTabMenu]);

  // Undo/redo history
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef<number>(-1);
  const isHistoryOpRef = useRef(false);
  const snapshotTimerRef = useRef<number | null>(null);

  const pushHistory = (value: string) => {
    // Trim forward history
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    // Avoid duplicate snapshots
    if (historyRef.current[historyIdxRef.current] === value) return;
    historyRef.current.push(value);
    historyIdxRef.current = historyRef.current.length - 1;
  };

  const undo = () => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    isHistoryOpRef.current = true;
    setContent(historyRef.current[historyIdxRef.current] ?? null);
    isHistoryOpRef.current = false;
  };

  const redo = () => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    isHistoryOpRef.current = true;
    setContent(historyRef.current[historyIdxRef.current] ?? null);
    isHistoryOpRef.current = false;
  };

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const local = await db.songs.get(slug);
      if (cancelled) return;
      if (local) {
        setTitle(local.title);
        setContent(local.content);
        setOriginal(local.content);
        setHasDoc(true);
        pushHistory(local.content);
        return;
      }
      if (!navigator.onLine) {
        setLoadError("This song isn't synced to this device, and you're offline.");
        return;
      }
      try {
        const res = await fetch(`/api/songs/${encodeURIComponent(slug)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setLoadError("No track found for this slug.");
          return;
        }
        if (!res.ok) {
          setLoadError(`Failed to load (${res.status}).`);
          return;
        }
        const detail = (await res.json()) as SongDetail;
        setTitle(detail.title);
        setHasDoc(Boolean(detail.content));
        setOriginal(detail.content ?? "");
        const initial = detail.content ?? newSongTemplate(detail);
        setContent(initial);
        pushHistory(initial);
      } catch {
        if (!cancelled) setLoadError("Failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const dirty = content !== null && content !== original;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        void saveRef.current();
        return;
      }
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContentChange = (next: string) => {
    setContent(next);
    if (isHistoryOpRef.current) return;
    // Debounce: take a snapshot 1.5 s after the user stops typing
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = window.setTimeout(() => pushHistory(next), 1500);
  };

  const save = async () => {
    if (!slug || content === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.status === 401) {
        window.location.href =
          "/auth/login?returnTo=" + encodeURIComponent(window.location.pathname);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setSaveError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      const saved = (await res.json()) as SyncSong;
      await db.songs.put(saved);
      setOriginal(content);
      router.push(`/songs/${encodeURIComponent(slug)}`);
    } catch {
      setSaveError("Save failed — check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!slug) return;
    if (!window.confirm("Delete this ChordPro document? The track itself is unaffected.")) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) {
        setSaveError(`Delete failed (${res.status})`);
        return;
      }
      await db.songs.delete(slug);
      router.push("/");
    } catch {
      setSaveError("Delete failed — check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const insertSnippet = (before: string, after = "") => {
    const ta = textareaRef.current;
    if (!ta || content === null) return;
    pushHistory(content);
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const selected = value.slice(s, e);
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    setContent(next);
    pushHistory(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };

  const insertTab = (type: "guitar" | "bass") => {
    const lines = type === "guitar" ? GUITAR_TAB : BASS_TAB;
    insertSnippet(`{start_of_tab}\n${lines}\n`, `\n{end_of_tab}`);
    setShowTabMenu(false);
  };

  if (!slug) return <div className="page-message">Loading…</div>;

  if (loadError) {
    return (
      <div className="page-message">
        <p>{loadError}</p>
        <Link className="btn" href="/">
          Back to songs
        </Link>
      </div>
    );
  }

  const disabled = content === null || !online;

  return (
    <div className="page page--editor">
      <header className="song-header">
        <Link
          href={hasDoc ? `/songs/${encodeURIComponent(slug)}` : "/"}
          className="btn btn--ghost song-header__back"
          aria-label="Cancel"
        >
          ‹
        </Link>
        <div className="song-header__titles">
          <h1>{title || slug}</h1>
          <p>{hasDoc ? "Editing ChordPro" : "New ChordPro document"}</p>
        </div>
        <div className="song-header__actions">
          {hasDoc && (
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={remove}
              disabled={saving || !online}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={save}
            disabled={saving || !online || content === null || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {!online && (
        <div className="editor-notice">Editing is disabled while offline.</div>
      )}
      {saveError && <div className="editor-error">{saveError}</div>}

      <div className="editor-toolbar" aria-label="ChordPro snippets">
        <button
          type="button"
          className="editor-toolbar__btn"
          onClick={() => insertSnippet("{start_of_chorus}\n", "\n{end_of_chorus}")}
          disabled={disabled}
        >
          Chorus
        </button>
        <button
          type="button"
          className="editor-toolbar__btn"
          onClick={() => insertSnippet("{start_of_verse}\n", "\n{end_of_verse}")}
          disabled={disabled}
        >
          Verse
        </button>

        {/* Tab with instrument dropdown — menu rendered outside overflow container */}
        <button
          ref={tabBtnRef}
          type="button"
          className="editor-toolbar__btn"
          onClick={() => {
            if (!showTabMenu && tabBtnRef.current) {
              const rect = tabBtnRef.current.getBoundingClientRect();
              tabMenuPosRef.current = { top: rect.bottom + 6, left: rect.left };
            }
            setShowTabMenu((v) => !v);
          }}
          disabled={disabled}
        >
          Tab ▾
        </button>

        <button
          type="button"
          className="editor-toolbar__btn"
          onClick={() => insertSnippet("{comment: }")}
          disabled={disabled}
        >
          Comment
        </button>
        <button
          type="button"
          className="editor-toolbar__btn"
          onClick={() => insertSnippet("[", "]")}
          disabled={disabled}
        >
          [Chord]
        </button>
        <button
          type="button"
          className="editor-toolbar__btn"
          onClick={() => insertSnippet("{soh}", "{eoh}")}
          disabled={disabled}
        >
          Highlight
        </button>
      </div>

      {showTabMenu && (
        <>
          <div
            className="editor-tab-overlay"
            onClick={() => setShowTabMenu(false)}
          />
          <div ref={tabMenuRef} className="editor-tab-menu">
            <button
              type="button"
              className="editor-tab-menu__item"
              onClick={() => insertTab("guitar")}
            >
              Guitar (EADGBe)
            </button>
            <button
              type="button"
              className="editor-tab-menu__item"
              onClick={() => insertTab("bass")}
            >
              Bass (EADG)
            </button>
            <button
              type="button"
              className="editor-tab-menu__item"
              onClick={() => { insertSnippet("{start_of_tab}\n", "\n{end_of_tab}"); setShowTabMenu(false); }}
            >
              Blank
            </button>
          </div>
        </>
      )}

      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={content ?? ""}
        onChange={(e) => handleContentChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        placeholder={content === null ? "Loading…" : ""}
      />
    </div>
  );
}
