import { withUser } from "@/lib/api";
import { retrieve } from "@/lib/rag/retrieve";
import type { RetrievalFilters } from "@/lib/types";

export const POST = withUser(async (user, request) => {
  const body = (await request.json()) as {
    query?: string;
    filters?: RetrievalFilters;
    topK?: number;
  };

  const query = body.query?.trim() ?? "";
  if (!query) throw new Error("Enter something to search for.");

  const result = await retrieve(
    user.id,
    query,
    body.filters ?? {},
    Math.min(Math.max(body.topK ?? 8, 1), 30),
  );

  // Vectors are large and useless to the client — strip them from the response.
  return {
    ...result,
    results: result.results.map((r) => ({
      ...r,
      chunk: { ...r.chunk, embedding: undefined },
    })),
  };
});
