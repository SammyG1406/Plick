import { NOTION_FIXTURES } from "./fixtures";
import type { Connector } from "./types";
import type { DocumentRef, RawDocument } from "../types";

const NOTION_VERSION = "2022-06-28";

/** Fixture-backed connector. Same contract as the live one, no network. */
const mockNotion: Connector = {
  id: "notion",
  name: "Notion",
  description: "Pages and databases from a Notion workspace.",
  live: false,
  requires: "NOTION_TOKEN",
  async listDocuments(): Promise<DocumentRef[]> {
    return NOTION_FIXTURES.map(({ externalId, title, origin, updatedAt }) => ({
      externalId,
      title,
      origin,
      updatedAt,
    }));
  },
  async fetchContent(externalId: string): Promise<RawDocument> {
    const doc = NOTION_FIXTURES.find((d) => d.externalId === externalId);
    if (!doc) throw new Error(`Unknown Notion page: ${externalId}`);
    return doc;
  },
};

interface NotionRichText {
  plain_text: string;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

function plain(rich: NotionRichText[] | undefined): string {
  return (rich ?? []).map((r) => r.plain_text).join("");
}

/**
 * Notion blocks become markdown so the chunker sees the same heading structure
 * it gets from uploaded files. Anything we don't recognise falls through as its
 * plain text rather than being dropped.
 */
function blockToMarkdown(block: NotionBlock, depth: number): string {
  const body = block[block.type] as { rich_text?: NotionRichText[]; language?: string } | undefined;
  const text = plain(body?.rich_text);
  const indent = "  ".repeat(depth);

  switch (block.type) {
    case "heading_1":
      return `\n# ${text}\n`;
    case "heading_2":
      return `\n## ${text}\n`;
    case "heading_3":
      return `\n### ${text}\n`;
    case "bulleted_list_item":
      return `${indent}- ${text}`;
    case "numbered_list_item":
      return `${indent}1. ${text}`;
    case "to_do":
      return `${indent}- [ ] ${text}`;
    case "quote":
      return `> ${text}`;
    case "code":
      return `\n\`\`\`${body?.language ?? ""}\n${text}\n\`\`\`\n`;
    case "divider":
      return "\n---\n";
    case "child_page":
      return `\n## ${(block.child_page as { title?: string } | undefined)?.title ?? ""}\n`;
    default:
      return text;
  }
}

function liveNotion(token: string): Connector {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "notion-version": NOTION_VERSION,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Notion API ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };

  const collectBlocks = async (blockId: string, depth = 0): Promise<string[]> => {
    const lines: string[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ page_size: "100" });
      if (cursor) query.set("start_cursor", cursor);
      const page = await call<{
        results: NotionBlock[];
        next_cursor: string | null;
        has_more: boolean;
      }>(`/blocks/${blockId}/children?${query}`);

      for (const block of page.results) {
        lines.push(blockToMarkdown(block, depth));
        // Toggles and nested lists hold their content in children; recursing
        // keeps that text in the corpus instead of silently losing it.
        if (block.has_children && depth < 3) {
          lines.push(...(await collectBlocks(block.id, depth + 1)));
        }
      }
      cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return lines;
  };

  return {
    id: "notion",
    name: "Notion",
    description: "Pages shared with your Notion integration.",
    live: true,
    requires: "NOTION_TOKEN",
    async listDocuments() {
      const response = await call<{
        results: {
          id: string;
          url?: string;
          last_edited_time?: string;
          properties?: Record<string, { type: string; title?: NotionRichText[] }>;
        }[];
      }>("/search", {
        method: "POST",
        body: JSON.stringify({
          filter: { value: "page", property: "object" },
          page_size: 50,
        }),
      });

      return response.results.map((page) => {
        const titleProp = Object.values(page.properties ?? {}).find(
          (p) => p.type === "title",
        );
        return {
          externalId: page.id,
          title: plain(titleProp?.title) || "Untitled Notion page",
          origin: page.url,
          updatedAt: page.last_edited_time,
        };
      });
    },
    async fetchContent(externalId) {
      const [page, lines] = await Promise.all([
        call<{
          url?: string;
          last_edited_time?: string;
          properties?: Record<string, { type: string; title?: NotionRichText[] }>;
        }>(`/pages/${externalId}`),
        collectBlocks(externalId),
      ]);
      const titleProp = Object.values(page.properties ?? {}).find((p) => p.type === "title");
      return {
        externalId,
        title: plain(titleProp?.title) || "Untitled Notion page",
        kind: "notion",
        origin: page.url,
        updatedAt: page.last_edited_time,
        text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      };
    },
  };
}

export function notionConnector(): Connector {
  const token = process.env.NOTION_TOKEN;
  return token ? liveNotion(token) : mockNotion;
}
