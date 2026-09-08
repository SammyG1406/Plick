"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@/lib/types";

const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/browse", label: "Browse" },
  { href: "/study", label: "Study" },
];

export function AppNav({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/library" className="font-semibold tracking-tight">
          Plick
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
          <button
            onClick={signOut}
            className="rounded-full border border-line px-3 py-1.5 text-sm transition hover:bg-surface-2"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
