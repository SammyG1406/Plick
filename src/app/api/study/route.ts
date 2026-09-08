import { withUser } from "@/lib/api";
import { generateStudyMaterial } from "@/lib/study";
import type { RetrievalFilters, StudyMode } from "@/lib/types";

const MODES: StudyMode[] = ["summary", "flashcards", "quiz"];

export const POST = withUser(async (user, request) => {
  const body = (await request.json()) as {
    mode?: StudyMode;
    query?: string;
    filters?: RetrievalFilters;
  };

  const mode = body.mode && MODES.includes(body.mode) ? body.mode : "summary";
  return generateStudyMaterial({
    ownerId: user.id,
    mode,
    query: body.query,
    filters: body.filters,
  });
});
