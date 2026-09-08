import type { DocumentRef, RawDocument, SourceKind } from "../types";

export interface Connector {
  id: Exclude<SourceKind, "upload">;
  name: string;
  /** Shown on the connect card. */
  description: string;
  /** False when the connector is running on fixtures rather than a live account. */
  live: boolean;
  /** What the user would need to set to make `live` true. */
  requires: string;
  listDocuments(): Promise<DocumentRef[]>;
  fetchContent(externalId: string): Promise<RawDocument>;
}
