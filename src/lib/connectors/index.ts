import { googleDocsConnector } from "./gdocs";
import { notionConnector } from "./notion";
import type { Connector } from "./types";

export type { Connector } from "./types";

export function getConnectors(): Connector[] {
  return [notionConnector(), googleDocsConnector()];
}

export function getConnector(id: string): Connector | undefined {
  return getConnectors().find((c) => c.id === id);
}
