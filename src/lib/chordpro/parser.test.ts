import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseChordPro, parseLyricLine, type Section } from "./parser";

describe("parseLyricLine", () => {
  it("splits text around inline chords", () => {
    const { segments, hasChords, chordOnly } = parseLyricLine(
      "That kind of [F]love again",
    );
    expect(hasChords).toBe(true);
    expect(chordOnly).toBe(false);
    expect(segments).toEqual([
      { chord: undefined, text: "That kind of " },
      { chord: "F", text: "love again" },
    ]);
  });

  it("handles chords mid-word", () => {
    const { segments } = parseLyricLine("Every[Am]thing you [G]want");
    expect(segments).toEqual([
      { chord: undefined, text: "Every" },
      { chord: "Am", text: "thing you " },
      { chord: "G", text: "want" },
    ]);
  });

  it("detects chord-only lines and preserves spacing", () => {
    const { segments, chordOnly } = parseLyricLine("[D#m] [G#] [A#m] [A#m]");
    expect(chordOnly).toBe(true);
    expect(segments).toEqual([
      { chord: "D#m", text: " " },
      { chord: "G#", text: " " },
      { chord: "A#m", text: " " },
      { chord: "A#m", text: "" },
    ]);
  });

  it("preserves leading whitespace on chord-only lines (tab alignment)", () => {
    const { segments, chordOnly } = parseLyricLine("    [D#] [G#]");
    expect(chordOnly).toBe(true);
    expect(segments[0]).toEqual({ chord: undefined, text: "    " });
  });

  it("treats plain text as a single chordless segment", () => {
    const { segments, hasChords } = parseLyricLine("We are diamonds");
    expect(hasChords).toBe(false);
    expect(segments).toEqual([{ chord: undefined, text: "We are diamonds" }]);
  });
});

describe("parseChordPro", () => {
  it("reads metadata directives including aliases", () => {
    const song = parseChordPro(
      "{t: My Song}\n{st: The Band}\n{key: A#m}\n{capo: 2}",
    );
    expect(song.title).toBe("My Song");
    expect(song.subtitle).toBe("The Band");
    expect(song.artist).toBe("The Band");
    expect(song.key).toBe("A#m");
    expect(song.capo).toBe("2");
  });

  it("creates verse and chorus sections", () => {
    const song = parseChordPro(
      "{start_of_verse}\nLine one\n{end_of_verse}\n{soc}\nChorus line\n{eoc}",
    );
    const kinds = song.sections.map((s) => s.kind);
    expect(kinds).toContain("verse");
    expect(kinds).toContain("chorus");
    const chorus = song.sections.find((s) => s.kind === "chorus") as Section;
    expect(chorus.lines).toEqual([
      { type: "lyric", segments: [{ chord: undefined, text: "Chorus line" }], hasChords: false },
    ]);
  });

  it("preserves tab content verbatim including pipes and dashes", () => {
    const tab = "G|---5---|\nD|-------|\nA|---5h7-|\nE|-------|";
    const song = parseChordPro(`{sot}\n${tab}\n{eot}`);
    const section = song.sections.find((s) => s.kind === "tab") as Section;
    expect(section.lines.map((l) => (l.type === "tab" ? l.text : "?"))).toEqual(
      tab.split("\n"),
    );
  });

  it("does not treat directive-like lyrics inside tab blocks as directives", () => {
    const song = parseChordPro("{sot}\n{comment: not a heading}\n{eot}");
    const section = song.sections.find((s) => s.kind === "tab") as Section;
    expect(section.lines[0]).toEqual({
      type: "tab",
      text: "{comment: not a heading}",
    });
  });

  it("turns comments into headings", () => {
    const song = parseChordPro("{comment: Chorus }");
    expect(song.sections[0].lines[0]).toEqual({
      type: "heading",
      text: "Chorus",
    });
  });

  it("handles inline {soh}...{eoh} highlights", () => {
    const song = parseChordPro("{soh}TAB is in original key!{eoh}");
    expect(song.sections[0].lines[0]).toEqual({
      type: "highlight",
      text: "TAB is in original key!",
    });
  });

  it("treats *-prefixed lines as performance notes", () => {
    const song = parseChordPro("*Bass comes in after big drums");
    expect(song.sections[0].lines[0]).toEqual({
      type: "note",
      text: "Bass comes in after big drums",
    });
  });

  it("treats short all-caps lines as headings", () => {
    const song = parseChordPro("INTRO\nTurn your magic on");
    expect(song.sections[0].lines[0]).toEqual({ type: "heading", text: "INTRO" });
    expect(song.sections[0].lines[1].type).toBe("lyric");
  });

  it("parses the real example file end to end", () => {
    const source = readFileSync(join(process.cwd(), "example.pro"), "utf8");
    const song = parseChordPro(source);
    expect(song.title).toBe("Adventure Of A Lifetime");
    expect(song.artist).toBe("Coldplay");
    expect(song.key).toBe("A#m");

    const tabSections = song.sections.filter((s) => s.kind === "tab");
    expect(tabSections).toHaveLength(2);
    const firstTabText = tabSections[0].lines
      .map((l) => (l.type === "tab" ? l.text : ""))
      .join("\n");
    expect(firstTabText).toContain("A|---5---5-3-5-----3h5-|");

    const choruses = song.sections.filter((s) => s.kind === "chorus");
    expect(choruses).toHaveLength(1);

    const verses = song.sections.filter((s) => s.kind === "verse");
    expect(verses.length).toBeGreaterThanOrEqual(3);
  });
});
