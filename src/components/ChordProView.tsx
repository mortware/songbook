import type {
  ParsedSong,
  Section,
  SongLine,
} from "@/lib/chordpro/parser";

/** Drop leading/trailing blank lines from a tab block. */
function trimTabLines(lines: SongLine[]): string[] {
  const texts = lines.map((l) => (l.type === "tab" ? l.text : ""));
  let start = 0;
  let end = texts.length;
  while (start < end && texts[start].trim() === "") start++;
  while (end > start && texts[end - 1].trim() === "") end--;
  return texts.slice(start, end);
}

function LineView({ line }: { line: SongLine }) {
  switch (line.type) {
    case "blank":
      return <div className="cp-blank" aria-hidden="true" />;
    case "heading":
      return <h3 className="cp-heading">{line.text}</h3>;
    case "note":
      return <div className="cp-note">{line.text}</div>;
    case "highlight":
      return (
        <div>
          <span className="cp-highlight">{line.text}</span>
        </div>
      );
    case "tab":
      return <pre className="cp-tab">{line.text}</pre>;
    case "chords":
      return (
        <div className="cp-chords-only">
          {line.segments.map((s, i) => (
            <span key={i}>
              {s.chord !== undefined && (
                <span className="cp-chord">{s.chord}</span>
              )}
              {s.text}
            </span>
          ))}
        </div>
      );
    case "lyric": {
      if (!line.hasChords) {
        return (
          <div className="cp-lyric-plain">
            {line.segments.map((s) => s.text).join("")}
          </div>
        );
      }
      return (
        <div className="cp-line">
          {line.segments.map((s, i) => (
            <span className="cp-seg" key={i}>
              <span className="cp-chord-row">{s.chord ?? " "}</span>
              <span className="cp-lyric">
                {s.text.length > 0 ? s.text : " "}
              </span>
            </span>
          ))}
        </div>
      );
    }
  }
}

function SectionView({ section }: { section: Section }) {
  if (section.kind === "tab") {
    return (
      <div className="cp-section">
        {section.label && <h3 className="cp-heading">{section.label}</h3>}
        <pre className="cp-tab">{trimTabLines(section.lines).join("\n")}</pre>
      </div>
    );
  }
  const className =
    section.kind === "chorus"
      ? "cp-section cp-section--chorus"
      : "cp-section";
  return (
    <div className={className}>
      {section.label && <h3 className="cp-heading">{section.label}</h3>}
      {section.lines.map((line, i) => (
        <LineView key={i} line={line} />
      ))}
    </div>
  );
}

export default function ChordProView({ song }: { song: ParsedSong }) {
  return (
    <div className="cp">
      {song.sections.map((section, i) => (
        <SectionView key={i} section={section} />
      ))}
    </div>
  );
}
