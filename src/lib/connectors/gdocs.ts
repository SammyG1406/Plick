import { GDOCS_FIXTURES } from "./fixtures";
import type { Connector } from "./types";
import type { DocumentRef, RawDocument } from "../types";

const mockGoogleDocs: Connector = {
  id: "gdocs",
  name: "Google Docs",
  description: "Documents from a connected Google Drive.",
  live: false,
  requires: "GOOGLE_ACCESS_TOKEN",
  async listDocuments(): Promise<DocumentRef[]> {
    return GDOCS_FIXTURES.map(({ externalId, title, origin, updatedAt }) => ({
      externalId,
      title,
      origin,
      updatedAt,
    }));
  },
  async fetchContent(externalId: string): Promise<RawDocument> {
    const doc = GDOCS_FIXTURES.find((d) => d.externalId === externalId);
    if (!doc) throw new Error(`Unknown Google Doc: ${externalId}`);
    return doc;
  },
};

/**
 * Live path against Drive + Docs.
 *
 * This reads a bearer token from the environment rather than running an OAuth
 * flow — enough to verify the wiring with a token from the OAuth playground,
 * but a real deployment needs a consent flow and refresh-token storage before
 * this is usable by anyone but you. Scopes required:
 *   drive.readonly, documents.readonly
 */
function liveGoogleDocs(accessToken: string): Connector {
  const call = async <T>(url: string): Promise<T> => {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Google API ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };

  interface DocElement {
    paragraph?: {
      elements?: { textRun?: { content?: string } }[];
      paragraphStyle?: { namedStyleType?: string };
    };
  }

  /** Named paragraph styles carry the outline, so map them back to markdown. */
  const headingPrefix = (style: string | undefined): string => {
    const match = /^HEADING_([1-6])$/.exec(style ?? "");
    return match ? `${"#".repeat(Number(match[1]))} ` : "";
  };

  return {
    id: "gdocs",
    name: "Google Docs",
    description: "Documents from your Google Drive.",
    live: true,
    requires: "GOOGLE_ACCESS_TOKEN",
    async listDocuments() {
      const query = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.document' and trashed=false",
        fields: "files(id,name,modifiedTime,webViewLink)",
        pageSize: "50",
      });
      const response = await call<{
        files: { id: string; name: string; modifiedTime?: string; webViewLink?: string }[];
      }>(`https://www.googleapis.com/drive/v3/files?${query}`);
      return response.files.map((file) => ({
        externalId: file.id,
        title: file.name,
        origin: file.webViewLink,
        updatedAt: file.modifiedTime,
      }));
    },
    async fetchContent(externalId) {
      const doc = await call<{
        title: string;
        body?: { content?: DocElement[] };
      }>(`https://docs.googleapis.com/v1/documents/${externalId}`);

      const lines: string[] = [];
      for (const element of doc.body?.content ?? []) {
        if (!element.paragraph) continue;
        const text = (element.paragraph.elements ?? [])
          .map((e) => e.textRun?.content ?? "")
          .join("")
          .replace(/\n+$/, "");
        if (!text.trim()) {
          lines.push("");
          continue;
        }
        lines.push(headingPrefix(element.paragraph.paragraphStyle?.namedStyleType) + text);
      }

      return {
        externalId,
        title: doc.title,
        kind: "gdocs",
        origin: `https://docs.google.com/document/d/${externalId}`,
        text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      };
    },
  };
}

export function googleDocsConnector(): Connector {
  const token = process.env.GOOGLE_ACCESS_TOKEN;
  return token ? liveGoogleDocs(token) : mockGoogleDocs;
}
