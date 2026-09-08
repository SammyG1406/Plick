import { withUser } from "@/lib/api";
import { buildTaxonomy } from "@/lib/rag/ingest";

export const GET = withUser(async (user) => buildTaxonomy(user.id));
