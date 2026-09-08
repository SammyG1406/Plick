import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

let client: Anthropic | null | undefined;

/**
 * Returns null when no credentials are configured. Every caller must handle
 * that: the app is designed to work end-to-end without an API key, with
 * heuristic fallbacks standing in for the model.
 */
export function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const hasKey = Boolean(
    process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN,
  );
  client = hasKey ? new Anthropic() : null;
  return client;
}

export function llmEnabled(): boolean {
  return getClient() !== null;
}

/** Narrows a typed SDK error into something safe to log and surface. */
export function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "Anthropic credentials were rejected — falling back to heuristics.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Anthropic rate limit hit — falling back to heuristics.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error ${error.status} — falling back to heuristics.`;
  }
  return error instanceof Error ? error.message : String(error);
}
