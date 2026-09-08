# Plick

A web app that ingests your course notes — uploaded files, Notion pages, Google
Docs — works out which **week** and which **concepts** each section covers, and
retrieves them semantically so you can revise a topic without remembering which
file it landed in.

```bash
npm install
npm run dev      # http://localhost:3000
```

No configuration needed. It runs end to end with zero API keys; see
[Degraded modes](#degraded-modes) for what changes when you add them.

Sign in with any email (mock auth), then **Sync Notion** or **Sync Google Docs**
on the Library page to load sample course notes and see the whole pipeline work.

---

## What it does

**Library** — upload PDF / DOCX / Markdown / HTML / text, or pull from a
connector. Each document is split into passages, placed on the course timeline,
and tagged with concepts.

**Browse** — filter by unit or concept, or ask a question in your own words.
Week numbers in your question become filters automatically, and every result
shows the passage, its unit, its concepts, and its retrieval score.

**Study** — generate a summary, flashcards, or a quiz for any unit or concept,
built only from passages retrieved out of your own library, with the sources listed.

---

## How retrieval works

Every query runs three channels at once, because each fails differently:

| Channel | Catches | Misses |
| --- | --- | --- |
| **Dense** vectors | paraphrase — "how do we stop overfitting" → regularisation | exact symbols and rare proper nouns |
| **BM25** lexical | precise terminology, names, notation | anything phrased differently |
| **Concept** index | topic matches where query and passage share no words | material with no concept tags |

Each channel is min-max normalised (BM25 is unbounded, cosine sits in [-1, 1]),
then fused with weights that shift toward BM25 when the local embedder is in use.
A diversity pass discounts repeat hits from one document so a single exhaustive
source can't crowd out the rest. Component scores are returned to the UI, so you
can always see *why* something surfaced.

### Recognising weeks

Course material is inconsistent: the same unit appears as `Week 3`, `Lecture 3`,
`Topic 3` or `W03`. Plick detects every scheme, then picks one canonical scheme
per document (the one covering the most distinct numbers). Sections without a
marker inherit from the nearest one above them.

Units are keyed by **label, not number** — `Week 3` and `Lecture 3` come from
different subjects and must not merge. Each placement carries its provenance,
shown in the UI:

- `explicit` — stated in the source text
- `inherited` — carried down from an earlier heading
- `inferred` — a model judgement about where it belongs

### Recognising concepts

With `ANTHROPIC_API_KEY` set, Claude reads a section outline and names concepts
the way a lecturer would, and can place sections the regex missed. Without it,
a heuristic uses section headings plus *recurring* bigrams — requiring a phrase
to appear more than once is what separates real terminology from one-off phrasing.

Concepts are corpus-level, not per-document: a concept taught in one unit and
revisited in another is one browsable entity pointing at both. Each gets its own
embedding, which is what powers the concept retrieval channel.

---

## Degraded modes

Nothing here fails closed. Missing credentials reduce quality and say so in the UI.

| Missing | Effect |
| --- | --- |
| `ANTHROPIC_API_KEY` | Concepts from TF-IDF instead of Claude. Summaries become extracted sentences. **Quizzes degrade to flashcards** rather than inventing distractors. |
| `VOYAGE_API_KEY` | Local hashed n-gram vectors. Good on morphology and word order; cannot connect "car" to "automobile". BM25 is weighted higher to compensate. |
| `NOTION_TOKEN` / `GOOGLE_ACCESS_TOKEN` | Connector serves sample course notes through the identical interface. |

The Library page shows the active mode as badges. Copy `.env.example` to
`.env.local` to change any of it.

---

## Layout

```
src/
├─ app/
│  ├─ page.tsx              landing
│  ├─ login/                mock sign-in
│  ├─ (app)/                authenticated shell
│  │  ├─ library/           upload + connectors + indexed docs
│  │  ├─ browse/            unit/concept facets + semantic search
│  │  └─ study/             summaries, flashcards, quizzes
│  └─ api/                  auth, sources, connectors, taxonomy, search, study
├─ lib/
│  ├─ rag/
│  │  ├─ chunk.ts           structure-aware splitting, heading trails
│  │  ├─ weeks.ts           unit-marker detection across schemes
│  │  ├─ enrich.ts          concept extraction (Claude + heuristic)
│  │  ├─ embeddings/        provider interface: local | voyage | openai
│  │  ├─ bm25.ts            lexical channel
│  │  ├─ retrieve.ts        three-channel fusion + filters
│  │  └─ ingest.ts          pipeline + corpus-wide concept index
│  ├─ connectors/           Notion and Google Docs (live + fixture)
│  ├─ parse.ts              PDF, DOCX, HTML, text extraction
│  ├─ store.ts              persistence
│  ├─ study.ts              study-material generation
│  └─ auth.ts               mock session
```

---

## Before this goes anywhere real

Two things are deliberately not production-grade:

**Authentication is fake.** `src/lib/auth.ts` accepts any email with no password
and stores identity in an unsigned cookie. That cookie is the only thing
separating one user's corpus from another's, and it is trivially forgeable.
Replace that one file before exposing this to anyone.

**Storage is a JSON file.** `src/lib/store.ts` keeps everything in memory and
flushes to `.data/store.json`. Fine for a single user and a few thousand
passages; it does not survive concurrent writers or horizontal scaling. The
retrieval layer only talks to it through that module's exported functions, so
moving to Postgres + pgvector means reimplementing that file and nothing else.
