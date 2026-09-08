import { cookies } from "next/headers";
import { createHash } from "crypto";
import type { User } from "./types";

const COOKIE = "plick_session";

/**
 * Mock authentication. Any email is accepted and the "session" is a plain
 * cookie holding the user's identity — there is no password check, no token
 * signing, and no server-side session record.
 *
 * The rest of the app only ever asks for `requireUser()`, so replacing this
 * with a real provider means rewriting this file and nothing else. Do that
 * before this is exposed to anyone, because today the cookie is trivially
 * forgeable and ownerId is the only thing separating one user's corpus from
 * another's.
 */

/** Stable per-email id, so signing back in returns you to your own documents. */
function ownerIdFor(email: string): string {
  return createHash("sha1").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

function nameFor(email: string): string {
  const local = email.split("@")[0] ?? "there";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildUser(email: string): User {
  return { id: ownerIdFor(email), email: email.trim(), name: nameFor(email) };
}

export async function getUser(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<User>;
    if (!parsed.email || !parsed.id) return null;
    return { id: parsed.id, email: parsed.email, name: parsed.name ?? nameFor(parsed.email) };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new UnauthorisedError();
  return user;
}

export class UnauthorisedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorisedError";
  }
}

export async function setSession(user: User): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, encodeURIComponent(JSON.stringify(user)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
