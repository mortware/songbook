/**
 * Minimal ChordPro parser covering the subset in the spec:
 * metadata directives, verse/chorus/tab sections, comments,
 * inline chords, highlights ({soh}/{eoh}) and free text.
 */

export interface Segment {
  /** Chord name (without brackets). Undefined for text before the first chord. */
  chord?: string;
  text: string;
}

export type SongLine =
  | { type: "blank" }
  | { type: "heading"; text: string }
  | { type: "note"; text: string }
  | { type: "highlight"; text: string }
  | { type: "tab"; text: string }
  | { type: "chords"; segments: Segment[] }
  | { type: "lyric"; segments: Segment[]; hasChords: boolean };

export type SectionKind = "none" | "verse" | "chorus" | "tab";

export interface Section {
  kind: SectionKind;
  label?: string;
  lines: SongLine[];
}

export interface ParsedSong {
  title?: string;
  subtitle?: string;
  artist?: string;
  key?: string;
  capo?: string;
  sections: Section[];
}

const DIRECTIVE_RE = /^\{\s*([\w-]+)\s*(?::\s*(.*?))?\s*\}\s*$/;
const INLINE_HIGHLIGHT_RE = /^\{\s*soh\s*\}(.*)\{\s*eoh\s*\}\s*$/i;
const CHORD_TOKEN_RE = /\[([^\[\]]*)\]/g;

const DIRECTIVE_ALIASES: Record<string, string> = {
  t: "title",
  st: "subtitle",
  c: "comment",
  ci: "comment",
  cb: "comment",
  sov: "start_of_verse",
  eov: "end_of_verse",
  soc: "start_of_chorus",
  eoc: "end_of_chorus",
  sot: "start_of_tab",
  eot: "end_of_tab",
  soh: "start_of_highlight",
  eoh: "end_of_highlight",
};

function normalizeDirective(name: string): string {
  const key = name.toLowerCase().replace(/-/g, "_");
  return DIRECTIVE_ALIASES[key] ?? key;
}

export function parseLyricLine(line: string): {
  segments: Segment[];
  hasChords: boolean;
  chordOnly: boolean;
} {
  const segments: Segment[] = [];
  let hasChords = false;
  let lastIndex = 0;
  let currentChord: string | undefined;
  CHORD_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHORD_TOKEN_RE.exec(line))) {
    const text = line.slice(lastIndex, match.index);
    if (currentChord !== undefined || text) {
      segments.push({ chord: currentChord, text });
    }
    currentChord = match[1];
    hasChords = true;
    lastIndex = match.index + match[0].length;
  }
  const tail = line.slice(lastIndex);
  if (currentChord !== undefined || tail) {
    segments.push({ chord: currentChord, text: tail });
  }
  const chordOnly = hasChords && segments.every((s) => s.text.trim() === "");
  return { segments, hasChords, chordOnly };
}

/** Short all-caps lines like "INTRO" are treated as section headings. */
function isHeadingLike(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 32 &&
    /[A-Z]/.test(trimmed) &&
    /^[A-Z0-9\s/&'().,:!-]+$/.test(trimmed)
  );
}

export function parseChordPro(source: string): ParsedSong {
  const song: ParsedSong = { sections: [] };
  let current: Section = { kind: "none", lines: [] };
  let inHighlight = false;

  const flush = () => {
    if (current.lines.length > 0 || current.label) song.sections.push(current);
  };
  const startSection = (kind: SectionKind, label?: string) => {
    flush();
    current = { kind, label, lines: [] };
  };
  const endSection = () => {
    flush();
    current = { kind: "none", lines: [] };
  };

  // Strip BOM, split on any line ending.
  const lines = source.replace(/^﻿/, "").split(/\r?\n/);

  for (const line of lines) {
    // Inside a tab block everything except {end_of_tab} is verbatim.
    if (current.kind === "tab") {
      const m = line.match(DIRECTIVE_RE);
      if (m && normalizeDirective(m[1]) === "end_of_tab") {
        endSection();
        continue;
      }
      current.lines.push({ type: "tab", text: line });
      continue;
    }

    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      const name = normalizeDirective(directive[1]);
      const value = (directive[2] ?? "").trim();
      switch (name) {
        case "title":
          song.title = value;
          break;
        case "subtitle":
          song.subtitle = value;
          song.artist ??= value;
          break;
        case "artist":
          song.artist = value;
          break;
        case "key":
          song.key = value;
          break;
        case "capo":
          song.capo = value;
          break;
        case "comment":
          current.lines.push({ type: "heading", text: value });
          break;
        case "start_of_verse":
          startSection("verse", value || undefined);
          break;
        case "start_of_chorus":
          startSection("chorus", value || undefined);
          break;
        case "start_of_tab":
          startSection("tab", value || undefined);
          break;
        case "end_of_verse":
        case "end_of_chorus":
        case "end_of_tab":
          endSection();
          break;
        case "start_of_highlight":
          inHighlight = true;
          break;
        case "end_of_highlight":
          inHighlight = false;
          break;
        default:
          // Unknown directive — ignore (v1 doesn't support the full spec).
          break;
      }
      continue;
    }

    const inlineHighlight = line.match(INLINE_HIGHLIGHT_RE);
    if (inlineHighlight) {
      current.lines.push({ type: "highlight", text: inlineHighlight[1].trim() });
      continue;
    }

    if (line.trim() === "") {
      current.lines.push({ type: "blank" });
      continue;
    }

    if (inHighlight) {
      current.lines.push({ type: "highlight", text: line.trim() });
      continue;
    }

    // Performance notes like "*Bass comes in after big drums"
    if (line.trimStart().startsWith("*")) {
      current.lines.push({
        type: "note",
        text: line.trim().replace(/^\*\s*/, ""),
      });
      continue;
    }

    const { segments, hasChords, chordOnly } = parseLyricLine(line);
    if (chordOnly) {
      current.lines.push({ type: "chords", segments });
      continue;
    }
    if (!hasChords && isHeadingLike(line)) {
      current.lines.push({ type: "heading", text: line.trim() });
      continue;
    }
    current.lines.push({ type: "lyric", segments, hasChords });
  }

  flush();
  return song;
}
