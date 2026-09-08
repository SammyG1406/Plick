import type { ReactNode } from "react";
import type { SourceKind, WeekTag } from "@/lib/types";

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Each tone is a pastel background with an ink chosen to stay legible on it. */
export type Tone = "neutral" | "accent" | "warning" | "lavender" | "mint" | "peach" | "sky" | "rose";

export function Pill({
  children,
  tone = "neutral",
  onClick,
  active,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const tones: Record<Tone, string> = {
    neutral: "border-line bg-surface-2 text-muted",
    accent: "border-transparent bg-accent-soft text-accent",
    warning: "border-transparent bg-warning-soft text-warning",
    lavender: "border-transparent bg-lavender text-lavender-ink",
    mint: "border-transparent bg-mint text-mint-ink",
    peach: "border-transparent bg-peach text-peach-ink",
    sky: "border-transparent bg-sky text-sky-ink",
    rose: "border-transparent bg-rose text-rose-ink",
  };
  const className = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
    active ? "border-accent bg-accent-soft text-accent" : tones[tone]
  }`;

  if (!onClick) {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${className} transition hover:border-accent hover:text-accent`}
    >
      {children}
    </button>
  );
}

/** A colour per source, so you can tell where a passage came from at a glance. */
const KINDS: Record<SourceKind, { label: string; tone: Tone }> = {
  upload: { label: "Upload", tone: "sky" },
  notion: { label: "Notion", tone: "mint" },
  gdocs: { label: "Google Docs", tone: "rose" },
};

export function SourceBadge({ kind }: { kind: SourceKind }) {
  return <Pill tone={KINDS[kind].tone}>{KINDS[kind].label}</Pill>;
}

/**
 * Week placement is a derived claim, not a fact from the file, so the badge
 * says how confident we are: stated in the text, carried down from an earlier
 * heading, or inferred by the model.
 */
export function WeekBadge({ week }: { week: WeekTag }) {
  const explanation = {
    explicit: "Labelled in the source text",
    inherited: "Carried down from an earlier heading",
    inferred: "Inferred from surrounding content",
  }[week.confidence];

  return (
    <Pill tone={week.number === null ? "peach" : "lavender"} title={explanation}>
      {week.label}
      {week.confidence !== "explicit" && <span aria-hidden>·</span>}
      {week.confidence !== "explicit" && (
        <span className="opacity-70">{week.confidence === "inherited" ? "carried" : "inferred"}</span>
      )}
    </Pill>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-3 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </p>
  );
}
