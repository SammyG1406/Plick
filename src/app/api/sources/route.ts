import { withUser } from "@/lib/api";
import { getConnectors } from "@/lib/connectors";
import { getEmbeddingProvider } from "@/lib/rag/embeddings";
import { llmEnabled } from "@/lib/llm";
import { listDocuments } from "@/lib/store";

export const GET = withUser(async (user) => {
  const provider = getEmbeddingProvider();
  return {
    documents: await listDocuments(user.id),
    connectors: getConnectors().map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      live: c.live,
      requires: c.requires,
    })),
    capabilities: {
      embeddingProvider: provider.id,
      embeddingModel: provider.model,
      semanticEmbeddings: provider.semantic,
      llm: llmEnabled(),
    },
  };
});
