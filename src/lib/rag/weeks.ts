import type { WeekTag } from "../types";

/**
 * Course material almost never says "week" consistently — the same unit shows up
 * as "Week 3", "Lecture 3", "Topic 3" or "W03" depending on who typed it. We
 * detect every scheme, then pick one canonical scheme per document so the
 * browser groups by a single axis instead of scattering across four.
 */
const SCHEMES: { name: string; priority: number; pattern: RegExp }[] = [
  { name: "Week", priority: 0, pattern: /\b(?:week|wk)\s*[-–—:.]?\s*(\d{1,2})\b/gi },
  { name: "Week", priority: 0, pattern: /\bw(\d{1,2})\b(?=[\s:.\-–—]|$)/gi },
  { name: "Module", priority: 1, pattern: /\bmodule\s*[-–—:.]?\s*(\d{1,2})\b/gi },
  { name: "Topic", priority: 2, pattern: /\btopic\s*[-–—:.]?\s*(\d{1,2})\b/gi },
  { name: "Unit", priority: 3, pattern: /\bunit\s*[-–—:.]?\s*(\d{1,2})\b/gi },
  { name: "Lecture", priority: 4, pattern: /\b(?:lecture|lec)\s*[-–—:.]?\s*(\d{1,2})\b/gi },
  { name: "Session", priority: 5, pattern: /\bsession\s*[-–—:.]?\s*(\d{1,2})\b/gi },
  { name: "Tutorial", priority: 6, pattern: /\b(?:tutorial|tute|lab)\s*[-–—:.]?\s*(\d{1,2})\b/gi },
  { name: "Chapter", priority: 7, pattern: /\bchapter\s*[-–—:.]?\s*(\d{1,2})\b/gi },
];

export interface WeekMarker {
  index: number;
  scheme: string;
  priority: number;
  number: number;
}

export function findMarkers(text: string): WeekMarker[] {
  const markers: WeekMarker[] = [];
  for (const { name, priority, pattern } of SCHEMES) {
    // Each call needs a fresh lastIndex; the literals above are module-level.
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const number = Number.parseInt(match[1], 10);
      if (!Number.isFinite(number) || number < 1 || number > 52) continue;
      markers.push({ index: match.index, scheme: name, priority, number });
    }
  }
  return markers.sort((a, b) => a.index - b.index);
}

/**
 * The scheme covering the most distinct numbers wins; ties break on the
 * priority order above. A doc with "Week 1..12" and one stray "Chapter 4"
 * resolves to Week.
 */
export function pickCanonicalScheme(markers: WeekMarker[]): string | null {
  if (markers.length === 0) return null;
  const byScheme = new Map<string, { numbers: Set<number>; priority: number }>();
  for (const m of markers) {
    const entry = byScheme.get(m.scheme) ?? { numbers: new Set(), priority: m.priority };
    entry.numbers.add(m.number);
    byScheme.set(m.scheme, entry);
  }
  return [...byScheme.entries()].sort((a, b) => {
    const spread = b[1].numbers.size - a[1].numbers.size;
    return spread !== 0 ? spread : a[1].priority - b[1].priority;
  })[0][0];
}

export const UNPLACED: WeekTag = {
  number: null,
  label: "Unplaced",
  confidence: "inferred",
};

export function tagFor(scheme: string, number: number, confidence: WeekTag["confidence"]): WeekTag {
  return { number, label: `${scheme} ${number}`, confidence };
}

/** Sorts numbered weeks ascending with unplaced material last. */
export function compareWeeks(a: WeekTag, b: WeekTag): number {
  if (a.number === null && b.number === null) return a.label.localeCompare(b.label);
  if (a.number === null) return 1;
  if (b.number === null) return -1;
  return a.number - b.number;
}
