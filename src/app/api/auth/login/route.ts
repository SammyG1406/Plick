import { NextResponse } from "next/server";
import { buildUser, setSession } from "@/lib/auth";

export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  // Mock auth: no password, no verification. See src/lib/auth.ts.
  const user = buildUser(email);
  await setSession(user);
  return NextResponse.json({ user });
}
