import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getUser()) redirect("/library");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Plick
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This is a mock sign-in. Any valid email address gets you in, and your library is
          keyed to whatever you type — use the same address to come back to it.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
