"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, post } from "@/lib/client";
import { EmptyState, Panel, Pill, SourceBadge, Spinner, WeekBadge } from "@/components/ui";
import type { StoredDocument } from "@/lib/types";

interface Capabilities {
  embeddingProvider: string;
  embeddingModel: string;
  semanticEmbeddings: boolean;
  llm: boolean;
}

interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  live: boolean;
  requires: string;
}

interface SourcesResponse {
  documents: StoredDocument[];
  connectors: ConnectorInfo[];
  capabilities: Capabilities;
}

interface IngestReport {
  document: StoredDocument;
  chunks: number;
  weeks: string[];
  concepts: string[];
  llmEnriched: boolean;
  note?: string;
}

interface IngestResponse {
  ingested: IngestReport[];
  failed: { name: string; reason: string }[];
}

export function LibraryView() {
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<IngestResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<SourcesResponse>("/api/sources"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your library.");
    }
  }, []);

  // Initial load only; every later refresh is triggered by an explicit action.
  useEffect(() => {
    api<SourcesResponse>("/api/sources")
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load your library."),
      );
  }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    for (const file of Array.from(files)) form.append("files", file);

    setBusy(`Reading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    setError(null);
    try {
      setLastRun(await post<IngestResponse>("/api/sources/upload", form));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function sync(connector: ConnectorInfo) {
    setBusy(`Syncing ${connector.name}…`);
    setError(null);
    try {
      setLastRun(await post<IngestResponse>(`/api/connectors/${connector.id}`));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy("Removing…");
    try {
      await fetch(`/api/sources/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <Spinner label="Loading your library…" />;
  }

  const { documents, connectors, capabilities } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted">
            {documents.length === 0
              ? "Add a source to build your index."
              : `${documents.length} document${documents.length === 1 ? "" : "s"}, ${documents.reduce(
                  (sum, d) => sum + d.chunkCount,
                  0,
                )} indexed passages.`}
          </p>
        </div>
        <CapabilityStrip capabilities={capabilities} />
      </div>

      {error && (
        <p className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          {error}
        </p>
      )}
      {busy && <Spinner label={busy} />}

      <Panel
        title="Upload documents"
        description="PDF, DOCX, Markdown, HTML or plain text. Up to 20 MB each."
      >
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center transition hover:border-accent hover:bg-accent-soft/40"
        >
          <span className="text-sm font-medium">Drop files here, or click to choose</span>
          <span className="text-xs text-muted">
            Week markers in filenames and headings are picked up automatically.
          </span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt,.html,.htm"
            className="sr-only"
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
      </Panel>

      <Panel title="Connected sources" description="Pull documents straight from your tools.">
        <div className="grid gap-4 sm:grid-cols-2">
          {connectors.map((connector) => (
            <div key={connector.id} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">{connector.name}</h3>
                <Pill tone={connector.live ? "accent" : "neutral"}>
                  {connector.live ? "Live" : "Sample data"}
                </Pill>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{connector.description}</p>
              {!connector.live && (
                <p className="mt-2 text-xs text-muted">
                  Set <code className="font-mono">{connector.requires}</code> to connect a real
                  account.
                </p>
              )}
              <button
                onClick={() => void sync(connector)}
                disabled={busy !== null}
                className="mt-4 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50"
              >
                Sync {connector.name}
              </button>
            </div>
          ))}
        </div>
      </Panel>

      {lastRun && <IngestSummary run={lastRun} />}

      <Panel title="Indexed documents">
        {documents.length === 0 ? (
          <EmptyState
            title="Nothing indexed yet"
            body="Upload a file or sync a connector. Plick will split it into passages, work out which week each one belongs to, and name the concepts it covers."
          />
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-start gap-4 py-4 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{document.title}</h3>
                    <SourceBadge kind={document.kind} />
                    {!document.llmEnriched && (
                      <Pill title="Concepts came from TF-IDF rather than a model">heuristic</Pill>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {document.chunkCount} passages · {document.charCount.toLocaleString()} characters
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {document.weeks.map((week) => (
                      <WeekBadge key={week.label} week={week} />
                    ))}
                  </div>
                  {document.concepts.length > 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      <span className="font-medium text-foreground">Concepts:</span>{" "}
                      {document.concepts.slice(0, 10).join(" · ")}
                      {document.concepts.length > 10 && ` · +${document.concepts.length - 10} more`}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void remove(document.id)}
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs transition hover:border-warning hover:text-warning"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Makes the degraded modes visible rather than letting them fail silently. */
function CapabilityStrip({ capabilities }: { capabilities: Capabilities }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill
        tone={capabilities.semanticEmbeddings ? "accent" : "warning"}
        title={
          capabilities.semanticEmbeddings
            ? "Trained embedding model in use"
            : "Local hashed-ngram vectors. Set VOYAGE_API_KEY for true semantic matching."
        }
      >
        embeddings: {capabilities.embeddingProvider}
      </Pill>
      <Pill
        tone={capabilities.llm ? "accent" : "warning"}
        title={
          capabilities.llm
            ? "Claude is naming concepts and writing study material"
            : "No ANTHROPIC_API_KEY — concepts come from TF-IDF and study material is extractive."
        }
      >
        concepts: {capabilities.llm ? "claude" : "tf-idf"}
      </Pill>
    </div>
  );
}

function IngestSummary({ run }: { run: IngestResponse }) {
  return (
    <Panel title="Last ingest">
      {run.ingested.length > 0 && (
        <ul className="space-y-3">
          {run.ingested.map((report) => (
            <li key={report.document.id} className="text-sm">
              <span className="font-medium">{report.document.title}</span>
              <span className="text-muted">
                {" "}
                — {report.chunks} passages
                {report.weeks.length > 0 && `, ${report.weeks.length} units`}
                {report.concepts.length > 0 && `, ${report.concepts.length} concepts`}
              </span>
              {report.note && <p className="mt-1 text-xs text-muted">{report.note}</p>}
            </li>
          ))}
        </ul>
      )}
      {run.failed.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-warning">
          {run.failed.map((failure) => (
            <li key={failure.name}>
              {failure.name} — {failure.reason}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
