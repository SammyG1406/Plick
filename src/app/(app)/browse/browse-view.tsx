"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, post } from "@/lib/client";
import { EmptyState, Pill, SourceBadge, Spinner, WeekBadge } from "@/components/ui";
import type { RetrievalFilters, RetrievedChunk } from "@/lib/types";

interface Taxonomy {
  weeks: {
    label: string;
    number: number | null;
    chunkCount: number;
    documentCount: number;
    concepts: string[];
  }[];
  concepts: { name: string; chunkCount: number; documentCount: number; weekLabels: string[] }[];
  documentCount: number;
  chunkCount: number;
}

interface SearchResponse {
  results: RetrievedChunk[];
  appliedWeeks: string[];
  matchedConcepts: string[];
  provider: { id: string; model: string; semantic: boolean };
  staleIndex: boolean;
}

export function BrowseView() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Taxonomy>("/api/taxonomy")
      .then(setTaxonomy)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load your index."),
      );
  }, []);

  const run = useCallback(
    async (nextQuery: string, filters: RetrievalFilters) => {
      // With no query text, the selected week and concepts describe the request.
      const effective =
        nextQuery.trim() || [...(filters.concepts ?? []), ...(filters.weeks ?? [])].join(" ");

      if (!effective) {
        setResponse(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        setResponse(
          await post<SearchResponse>("/api/search", {
            query: effective,
            filters,
            topK: 12,
          }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const asFilters = (nextWeek: string | null, nextConcepts: string[]): RetrievalFilters => ({
    weeks: nextWeek === null ? undefined : [nextWeek],
    concepts: nextConcepts.length ? nextConcepts : undefined,
  });

  // Facets retrieve on click rather than through an effect watching state, so
  // there is one render per interaction instead of a state-change cascade.
  function selectWeek(label: string | null) {
    const next = label === week ? null : label;
    setWeek(next);
    void run(query, asFilters(next, concepts));
  }

  function toggleConcept(name: string) {
    const next = concepts.includes(name)
      ? concepts.filter((c) => c !== name)
      : [...concepts, name];
    setConcepts(next);
    void run(query, asFilters(week, next));
  }

  function clearConcepts() {
    setConcepts([]);
    void run(query, asFilters(week, []));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(query, asFilters(week, concepts));
  }

  if (!taxonomy) {
    return error ? <p className="text-sm text-warning">{error}</p> : <Spinner label="Loading index…" />;
  }

  if (taxonomy.documentCount === 0) {
    return (
      <EmptyState
        title="Your index is empty"
        body="Add a document in the library and Plick will build the week and concept axes from it."
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

  const visibleConcepts =
    week === null
      ? taxonomy.concepts
      : taxonomy.concepts.filter((c) => c.weekLabels.includes(week));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Browse</h1>
        <p className="mt-1 text-sm text-muted">
          {taxonomy.weeks.length} units and {taxonomy.concepts.length} concepts across{" "}
          {taxonomy.documentCount} documents.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask in your own words — “why does Dijkstra break with negative weights?”"
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none transition focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast transition hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Units</h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5 lg:flex-col lg:items-start">
              <Pill active={week === null} onClick={() => selectWeek(null)}>
                All ({taxonomy.chunkCount})
              </Pill>
              {taxonomy.weeks.map((entry) => (
                <Pill
                  key={entry.label}
                  active={week === entry.label}
                  onClick={() => selectWeek(entry.label)}
                  title={`${entry.documentCount} document${entry.documentCount === 1 ? "" : "s"}`}
                >
                  {entry.label} ({entry.chunkCount})
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Concepts{week !== null && " in this unit"}
            </h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {visibleConcepts.length === 0 && (
                <p className="text-xs text-muted">No concepts tagged here yet.</p>
              )}
              {visibleConcepts.slice(0, 40).map((concept) => (
                <Pill
                  key={concept.name}
                  active={concepts.includes(concept.name)}
                  onClick={() => toggleConcept(concept.name)}
                  title={`${concept.chunkCount} passages across ${concept.documentCount} document${
                    concept.documentCount === 1 ? "" : "s"
                  }`}
                >
                  {concept.name}
                </Pill>
              ))}
            </div>
            {concepts.length > 0 && (
              <button
                onClick={clearConcepts}
                className="mt-3 text-xs text-muted underline underline-offset-4 hover:text-foreground"
              >
                Clear concept filters
              </button>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {error && <p className="text-sm text-warning">{error}</p>}
          {loading && <Spinner label="Retrieving…" />}

          {response?.staleIndex && (
            <p className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
              Your documents were indexed with a different embedding provider, so semantic
              matching is off. Re-upload them to rebuild the vectors.
            </p>
          )}

          {response && !loading && (
            <ResultsHeader response={response} />
          )}

          {!response && !loading && (
            <EmptyState
              title="Pick a unit or ask a question"
              body="Selecting a week or a concept retrieves the passages that cover it. Typing a question searches across everything, and week numbers in your question become filters automatically."
            />
          )}

          {response?.results.length === 0 && !loading && (
            <EmptyState
              title="No passages matched"
              body="Try widening the filters, or rephrasing with the terminology your notes use."
            />
          )}

          {response?.results.map((result) => (
            <ResultCard key={result.chunk.id} result={result} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultsHeader({ response }: { response: SearchResponse }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>
        {response.results.length} passage{response.results.length === 1 ? "" : "s"}
      </span>
      {response.appliedWeeks.length > 0 && (
        <Pill tone="accent">filtered to {response.appliedWeeks.join(", ")}</Pill>
      )}
      {response.matchedConcepts.length > 0 && (
        <span>
          concept matches: <span className="text-foreground">{response.matchedConcepts.join(", ")}</span>
        </span>
      )}
      <span className="ml-auto">
        {response.provider.id} / {response.provider.model}
        {!response.provider.semantic && " (lexical fallback)"}
      </span>
    </div>
  );
}

function ResultCard({ result }: { result: RetrievedChunk }) {
  const { chunk, document, breakdown, score } = result;

  return (
    <article className="rounded-xl border border-line bg-surface p-5">
      <header className="flex flex-wrap items-center gap-2">
        <WeekBadge week={chunk.week} />
        <SourceBadge kind={document.kind} />
        <span className="text-sm font-medium">{document.title}</span>
        <span
          className="ml-auto font-mono text-xs text-muted"
          title={`dense ${breakdown.dense.toFixed(3)} · lexical ${breakdown.lexical.toFixed(
            2,
          )} · concept ${breakdown.concept.toFixed(3)}`}
        >
          {score.toFixed(3)}
        </span>
      </header>

      {chunk.headings.length > 0 && (
        <p className="mt-2 text-xs text-muted">{chunk.headings.join(" › ")}</p>
      )}

      <p className="prose-notes mt-3 text-sm">{chunk.text}</p>

      <footer className="mt-4 flex flex-wrap items-center gap-1.5">
        {chunk.concepts.map((concept) => (
          <Pill key={concept}>{concept}</Pill>
        ))}
        {document.origin?.startsWith("http") && (
          <a
            href={document.origin}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs text-accent underline underline-offset-4"
          >
            Open source
          </a>
        )}
      </footer>
    </article>
  );
}
