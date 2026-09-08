import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

const STEPS = [
  {
    title: "Connect what you already have",
    body: "Upload PDFs, Word docs and markdown, or pull pages straight from Notion and Google Docs. Nothing needs reformatting first.",
    numeral: "bg-mint text-mint-ink",
  },
  {
    title: "Plick reads the structure",
    body: "It works out which week, lecture or topic each section belongs to — even when the labels are inconsistent or missing — and names the concepts being taught.",
    numeral: "bg-lavender text-lavender-ink",
  },
  {
    title: "Study by meaning, not filename",
    body: "Ask for week 6, or for Bayes' theorem, and get the passages that actually cover it. Then turn them into a summary, flashcards or a quiz.",
    numeral: "bg-peach text-peach-ink",
  },
];

export default async function LandingPage() {
  // Signed-in visitors have no use for the pitch.
  if (await getUser()) redirect("/library");

  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold tracking-tight">Plick</span>
        <Link
          href="/login"
          className="rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:bg-surface-2"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 pt-10 pb-20 sm:pt-20">
        <p className="text-sm font-medium text-accent">Retrieval for course notes</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          Your notes, organised by what they teach.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Plick ingests your documents, recognises the week and the concepts behind every
          section, and retrieves passages semantically — so you can revise a topic without
          remembering which file it landed in.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-full bg-accent-fill px-6 py-3 text-sm font-semibold text-accent-on-fill transition hover:opacity-90"
          >
            Try it with sample notes
          </Link>
          <span className="text-sm text-muted">Mock sign-in — any email works.</span>
        </div>

        <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="bg-surface p-6">
              <span
                className={`inline-flex size-7 items-center justify-center rounded-full font-mono text-xs font-medium ${step.numeral}`}
              >
                {i + 1}
              </span>
              <h2 className="mt-3 font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-line bg-surface-2 p-6 sm:p-8">
          <h2 className="font-semibold">How the retrieval works</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Every query runs through three channels at once. Dense vectors catch paraphrase,
            BM25 catches exact terminology that embeddings blur, and a concept index matches
            on topic even when the wording shares nothing with the source. The three are
            normalised and fused, and each result shows its component scores so you can see
            why it surfaced.
          </p>
        </div>
      </section>
    </main>
  );
}
