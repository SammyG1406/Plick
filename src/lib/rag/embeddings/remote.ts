import { normalise, type EmbeddingProvider } from "./types";

/** Voyage is Anthropic's recommended embedding partner. */
export function voyageProvider(apiKey: string): EmbeddingProvider {
  const model = process.env.VOYAGE_MODEL ?? "voyage-3";
  return {
    id: "voyage",
    model,
    dimensions: 1024,
    semantic: true,
    async embed(texts, kind) {
      const out: number[][] = [];
      // Voyage caps batch size; 128 stays comfortably inside it.
      for (let i = 0; i < texts.length; i += 128) {
        const batch = texts.slice(i, i + 128);
        const response = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: batch,
            input_type: kind,
          }),
        });
        if (!response.ok) {
          throw new Error(
            `Voyage embeddings failed (${response.status}): ${await response.text()}`,
          );
        }
        const json = (await response.json()) as {
          data: { index: number; embedding: number[] }[];
        };
        const ordered = [...json.data].sort((a, b) => a.index - b.index);
        out.push(...ordered.map((d) => normalise(d.embedding)));
      }
      return out;
    },
  };
}

export function openAIProvider(apiKey: string): EmbeddingProvider {
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  return {
    id: "openai",
    model,
    dimensions: 1536,
    semantic: true,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 128) {
        const batch = texts.slice(i, i + 128);
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, input: batch }),
        });
        if (!response.ok) {
          throw new Error(
            `OpenAI embeddings failed (${response.status}): ${await response.text()}`,
          );
        }
        const json = (await response.json()) as {
          data: { index: number; embedding: number[] }[];
        };
        const ordered = [...json.data].sort((a, b) => a.index - b.index);
        out.push(...ordered.map((d) => normalise(d.embedding)));
      }
      return out;
    },
  };
}
