"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/client";
import { EmptyState, Panel, Pill, Spinner } from "@/components/ui";
import type { Flashcard, QuizQuestion, StudyMode, StudyResult } from "@/lib/types";

interface Taxonomy {
  weeks: { label: string; number: number | null; chunkCount: number }[];
  concepts: { name: string; chunkCount: number; weekLabels: string[] }[];
  documentCount: number;
}

const MODES: { id: StudyMode; label: string; blurb: string }[] = [
  { id: "summary", label: "Summary", blurb: "A written overview plus the points worth keeping." },
  { id: "flashcards", label: "Flashcards", blurb: "Question-and-answer cards you can flip." },
  { id: "quiz", label: "Quiz", blurb: "Multiple choice with explained answers." },
];

export function StudyView() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [mode, setMode] = useState<StudyMode>("summary");
  const [week, setWeek] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<StudyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Taxonomy>("/api/taxonomy")
      .then(setTaxonomy)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load index."));
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await post<StudyResult>("/api/study", {
          mode,
          query: query.trim() || undefined,
          filters: {
            weeks: week === null ? undefined : [week],
            concepts: concepts.length ? concepts : undefined,
          },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!taxonomy) {
    return error ? <p className="text-sm text-warning">{error}</p> : <Spinner label="Loading…" />;
  }

  if (taxonomy.documentCount === 0) {
    return (
      <EmptyState
        title="Nothing to study yet"
        body="Study material is generated from your own notes, so add a document first."
        action={
          <Link
            href="/library"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast"
          >
            Go to library
          </Link>
        }
      />
    );
  }

  const relevantConcepts =
    week === null
      ? taxonomy.concepts
      : taxonomy.concepts.filter((c) => c.weekLabels.includes(week));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Study</h1>
        <p className="mt-1 text-sm text-muted">
          Everything below is built from passages retrieved out of your own library — nothing is
          added from outside it.
        </p>
      </div>

      <Panel title="What do you want to work on?">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {MODES.map((option) => (
              <button
                key={option.id}
                onClick={() => setMode(option.id)}
                aria-pressed={mode === option.id}
                className={`rounded-xl border p-4 text-left transition ${
                  mode === option.id
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:bg-surface-2"
                }`}
              >
                <span className="font-medium">{option.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{option.blurb}</span>
              </button>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Unit</h3>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Pill active={week === null} onClick={() => setWeek(null)}>
                Everything
              </Pill>
              {taxonomy.weeks.map((entry) => (
                <Pill
                  key={entry.label}
                  active={week === entry.label}
                  onClick={() => {
                    setWeek(entry.label === week ? null : entry.label);
                    // Concept tags are scoped to a unit, so a unit change retires them.
                    setConcepts([]);
                  }}
                >
                  {entry.label}
                </Pill>
              ))}
            </div>
          </div>

          {relevantConcepts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Narrow to concepts
              </h3>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {relevantConcepts.slice(0, 30).map((concept) => (
                  <Pill
                    key={concept.name}
                    active={concepts.includes(concept.name)}
                    onClick={() =>
                      setConcepts((current) =>
                        current.includes(concept.name)
                          ? current.filter((c) => c !== concept.name)
                          : [...current, concept.name],
                      )
                    }
                  >
                    {concept.name}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Optional — anything specific you keep getting wrong?"
            className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none transition focus:border-accent"
          />

          <button
            onClick={() => void generate()}
            disabled={loading}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Generating…" : `Generate ${mode}`}
          </button>
        </div>
      </Panel>

      {error && <p className="text-sm text-warning">{error}</p>}
      {loading && <Spinner label="Retrieving passages and writing…" />}
      {result && <StudyOutput result={result} />}
    </div>
  );
}

function StudyOutput({ result }: { result: StudyResult }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Pill tone="accent">{result.scope}</Pill>
        <Pill tone={result.generatedBy === "claude" ? "neutral" : "warning"}>
          {result.generatedBy === "claude" ? "written by Claude" : "extractive fallback"}
        </Pill>
        <span>{result.sources.length} passages used</span>
      </div>

      {result.summary && (
        <Panel title={result.mode === "summary" ? "Summary" : "Note"}>
          <p className="prose-notes text-sm">{result.summary}</p>
          {result.keyPoints && result.keyPoints.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {result.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-0.5 font-mono text-xs text-muted">{i + 1}</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {result.flashcards && result.flashcards.length > 0 && (
        <Panel title="Flashcards" description="Click a card to reveal the answer.">
          <div className="grid gap-3 sm:grid-cols-2">
            {result.flashcards.map((card, i) => (
              <FlashcardTile key={i} card={card} />
            ))}
          </div>
        </Panel>
      )}

      {result.quiz && result.quiz.length > 0 && (
        <Panel title="Quiz">
          <ol className="space-y-6">
            {result.quiz.map((question, i) => (
              <QuizItem key={i} index={i} question={question} />
            ))}
          </ol>
        </Panel>
      )}

      <Panel title="Sources" description="The passages this was built from.">
        <ul className="space-y-3">
          {result.sources.map((source) => (
            <li key={source.chunkId} className="text-sm">
              <span className="font-medium">{source.documentTitle}</span>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{source.snippet}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function FlashcardTile({ card }: { card: Flashcard }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      onClick={() => setRevealed((v) => !v)}
      className="flex min-h-32 flex-col rounded-xl border border-line p-4 text-left transition hover:border-accent"
    >
      <span className="text-sm font-medium">{card.front}</span>
      <span className="mt-3 text-sm text-muted">
        {revealed ? card.back : "Click to reveal"}
      </span>
      <span className="mt-auto pt-3">
        <Pill>{card.concept}</Pill>
      </span>
    </button>
  );
}

function QuizItem({ question, index }: { question: QuizQuestion; index: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  return (
    <li className="space-y-3">
      <p className="text-sm font-medium">
        {index + 1}. {question.question}
      </p>
      <div className="space-y-2">
        {question.options.map((option, i) => {
          const correct = i === question.answerIndex;
          const state = !answered
            ? "border-line hover:border-accent"
            : correct
              ? "border-positive text-positive"
              : i === picked
                ? "border-warning text-warning"
                : "border-line opacity-60";
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => setPicked(i)}
              className={`block w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition ${state}`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
          {question.explanation}
        </p>
      )}
    </li>
  );
}
