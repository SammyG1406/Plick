import { NextResponse } from "next/server";
import { requireUser, UnauthorisedError } from "./auth";
import type { User } from "./types";

/**
 * Wraps a route handler so every endpoint gets the same auth check and error
 * shape, instead of each one re-implementing both.
 */
export function withUser<T>(
  handler: (user: User, request: Request) => Promise<T>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    try {
      const user = await requireUser();
      return NextResponse.json(await handler(user, request));
    } catch (error) {
      if (error instanceof UnauthorisedError) {
        return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      }
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[api]", error);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  };
}
