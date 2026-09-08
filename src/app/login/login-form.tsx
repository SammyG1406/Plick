"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not sign in.");
      setPending(false);
      return;
    }

    router.push("/library");
    // The library reads the cookie server-side, so the cached route must refresh.
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@student.edu"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />
      </div>

      {error && <p className="text-sm text-warning">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>

      <button
        type="button"
        onClick={() => setEmail("demo@student.edu")}
        className="w-full text-center text-sm text-muted underline underline-offset-4 transition hover:text-foreground"
      >
        Use a demo address
      </button>
    </form>
  );
}
