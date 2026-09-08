import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/** Extensions we accept on the upload endpoint. */
export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".md", ".markdown", ".txt", ".html", ".htm"];

export function isSupported(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, level: string) => `\n${"#".repeat(Number(level))} `)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * PDF text arrives page by page. We keep the page break as a blank line so the
 * chunker treats it as a paragraph boundary, and prepend a page marker only
 * when the page starts mid-flow — otherwise the markers become noise in every
 * retrieved snippet.
 */
async function parsePdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages
    .map((page) => page.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

async function parseDocx(buffer: Buffer): Promise<string> {
  // Converting to HTML first preserves heading levels, which the chunker uses
  // to build its section trail; raw text extraction throws that away.
  const { value } = await mammoth.convertToHtml({ buffer });
  return stripHtml(value);
}

export async function parseFile(filename: string, buffer: Buffer): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return parsePdf(buffer);
  if (lower.endsWith(".docx")) return parseDocx(buffer);
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return stripHtml(buffer.toString("utf8"));
  }
  return buffer.toString("utf8");
}
