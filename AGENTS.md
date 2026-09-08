<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Plick

RAG over a student's own course notes. See `README.md` for the architecture.

## Rules specific to this codebase

**Nothing may fail closed on a missing credential.** The app must run end to end
with no API keys. Every path that uses Claude, a remote embedding provider, or a
real connector needs a working fallback, and the UI must show which mode is
active. If you add a capability, add its degraded mode in the same change.

**Never fabricate study content.** Study material is generated only from
retrieved passages. The quiz fallback deliberately refuses to invent multiple-
choice distractors and degrades to flashcards instead — keep that property.

**Units are identified by label, not number.** `Week 3` and `Lecture 3` are
different units from different subjects. Filter and group on `week.label`;
`weekNumbers` exists only for units named loosely in free-text queries.

**Two tokenizers, on purpose.** `tokenise()` in `rag/text.ts` serves retrieval
(BM25 + the local embedder) and expands compounds into joined and split forms.
Concept *names* are built from surface forms in `rag/enrich.ts` so they read
naturally. Don't merge them; `STOPWORDS` and `CONCEPT_STOPWORDS` are likewise
separate because "number" and "test" matter for matching but not for naming.

**`store.ts` is the only persistence boundary.** Retrieval reaches data through
its exported functions and nothing else, which is what keeps the eventual move
to pgvector a single-file change.

## Checks

```bash
npm run lint     # react-hooks rules are errors here, not warnings
npm run build    # runs the TypeScript check
```

