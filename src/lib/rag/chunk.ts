import { approxTokens } from "./text";
import { findMarkers, pickCanonicalScheme, tagFor, UNPLACED } from "./weeks";
import type { WeekTag } from "../types";

const TARGET_CHARS = 1200;
const MAX_CHARS = 1800;
const OVERLAP_CHARS = 180;

export interface DraftChunk {
  ordinal: number;
  text: string;
  headings: string[];
  week: WeekTag;
}

interface Block {
  text: string;
  /** Markdown heading level, or 0 for body text. */
  level: number;
  offset: number;
}

/** Splits into heading and paragraph blocks, keeping byte offsets for week lookup. */
function toBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split(/\r?\n/);
  let offset = 0;
  let buffer: string[] = [];
  let bufferOffset = 0;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) blocks.push({ text, level: 0, offset: bufferOffset });
    buffer = [];
  };

  for (const line of lines) {
    const lineOffset = offset;
    offset += line.length + 1;

    const md = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (md) {
      flush();
      blocks.push({ text: md[2], level: md[1].length, offset: lineOffset });
      continue;
    }

    // PDFs, Word exports and Google Docs plain text rarely keep their markdown,
    // so headings have to be recognised by shape: a short line that starts a
    // block, opens with a capital, and carries no terminal punctuation. The
    // 60-character ceiling is what separates a heading from the first line of a
    // wrapped paragraph, which runs to the full column width.
    const trimmed = line.trim();
    const bare =
      buffer.length === 0 &&
      trimmed.length > 0 &&
      trimmed.length <= 60 &&
      trimmed.split(/\s+/).length <= 9 &&
      /^[A-Z0-9]/.test(trimmed) &&
      !/[.,;:!?]$/.test(trimmed);

    if (bare) {
      flush();
      // Unit markers outrank topic headings, so they open a shallower level and
      // the heading trail reads "Lecture 2 › Bayes' theorem".
      const isUnit =
        /^(week|wk|w\d|lecture|lec|topic|module|unit|session|tutorial|lab|chapter)\b/i.test(trimmed);
      blocks.push({ text: trimmed.replace(/:$/, ""), level: isUnit ? 2 : 3, offset: lineOffset });
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }
    if (buffer.length === 0) bufferOffset = lineOffset;
    buffer.push(line);
  }
  flush();
  return blocks;
}

/** Overlap the tail of the previous chunk so a split sentence stays retrievable. */
function tailOverlap(text: string): string {
  if (text.length <= OVERLAP_CHARS) return text;
  const tail = text.slice(-OVERLAP_CHARS);
  const boundary = tail.search(/[.!?]\s/);
  return boundary === -1 ? tail : tail.slice(boundary + 2);
}

export function chunkDocument(source: string, title: string): DraftChunk[] {
  const markers = findMarkers(`${title}\n${source}`);
  const scheme = pickCanonicalScheme(markers);
  // Title markers sit at negative offsets relative to the body, which makes them
  // the natural document-wide default.
  const titleOffset = title.length + 1;
  const relevant = scheme ? markers.filter((m) => m.scheme === scheme) : [];
  const documentDefault =
    relevant.find((m) => m.index < titleOffset)?.number ?? null;

  const weekAt = (offset: number): WeekTag => {
    let current = documentDefault;
    let explicit = false;
    for (const marker of relevant) {
      const bodyIndex = marker.index - titleOffset;
      if (bodyIndex < 0) continue;
      if (bodyIndex > offset) break;
      current = marker.number;
      explicit = bodyIndex >= offset - 200;
    }
    if (current === null || !scheme) return UNPLACED;
    return tagFor(scheme, current, explicit ? "explicit" : "inherited");
  };

  const blocks = toBlocks(source);
  const chunks: DraftChunk[] = [];
  const headingStack: { level: number; text: string }[] = [];

  let buffer = "";
  let bufferOffset = 0;
  let bufferHeadings: string[] = [];

  const emit = () => {
    const text = buffer.trim();
    if (text.length < 40) {
      buffer = "";
      return;
    }
    chunks.push({
      ordinal: chunks.length,
      text,
      headings: [...bufferHeadings],
      week: weekAt(bufferOffset),
    });
    buffer = "";
  };

  for (const block of blocks) {
    if (block.level > 0) {
      // A new heading closes the current chunk so sections stay separable.
      emit();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= block.level) {
        headingStack.pop();
      }
      headingStack.push({ level: block.level, text: block.text });
      bufferHeadings = headingStack.map((h) => h.text);
      bufferOffset = block.offset;
      continue;
    }

    if (buffer === "") {
      bufferOffset = block.offset;
      bufferHeadings = headingStack.map((h) => h.text);
    }

    const candidate = buffer ? `${buffer}\n\n${block.text}` : block.text;

    if (candidate.length <= MAX_CHARS) {
      buffer = candidate;
      if (buffer.length >= TARGET_CHARS) {
        const carry = tailOverlap(buffer);
        emit();
        buffer = carry;
        bufferOffset = block.offset + block.text.length;
      }
      continue;
    }

    // Single block larger than the cap — split it on sentence boundaries.
    emit();
    const sentences = block.text.match(/[^.!?]+[.!?]+[\])'"]*\s*|[^.!?]+$/g) ?? [block.text];
    let running = "";
    for (const sentence of sentences) {
      if ((running + sentence).length > MAX_CHARS && running) {
        buffer = running;
        bufferOffset = block.offset;
        bufferHeadings = headingStack.map((h) => h.text);
        const carry = tailOverlap(running);
        emit();
        running = carry + sentence;
      } else {
        running += sentence;
      }
    }
    buffer = running;
    bufferOffset = block.offset;
    bufferHeadings = headingStack.map((h) => h.text);
  }
  emit();

  return chunks.map((c, i) => ({ ...c, ordinal: i }));
}

export function chunkTokens(chunk: DraftChunk): number {
  return approxTokens(chunk.text);
}
