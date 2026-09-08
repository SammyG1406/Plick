import { NextResponse } from "next/server";
import { requireUser, UnauthorisedError } from "@/lib/auth";
import { getConnector } from "@/lib/connectors";
import { ingestDocument } from "@/lib/rag/ingest";

/** Lists what the connector can see, so the user picks before syncing. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const connector = getConnector(id);
    if (!connector) return NextResponse.json({ error: "Unknown connector" }, { status: 404 });

    return NextResponse.json({
      connector: {
        id: connector.id,
        name: connector.name,
        description: connector.description,
        live: connector.live,
        requires: connector.requires,
      },
      documents: await connector.listDocuments(),
    });
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Connector failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Pulls the selected documents (or all of them) and runs them through ingest. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const connector = getConnector(id);
    if (!connector) return NextResponse.json({ error: "Unknown connector" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { externalIds?: string[] };
    const wanted =
      body.externalIds?.length
        ? body.externalIds
        : (await connector.listDocuments()).map((d) => d.externalId);

    const ingested = [];
    const failed: { name: string; reason: string }[] = [];

    for (const externalId of wanted) {
      try {
        const raw = await connector.fetchContent(externalId);
        ingested.push(await ingestDocument(user.id, raw));
      } catch (error) {
        failed.push({
          name: externalId,
          reason: error instanceof Error ? error.message : "Sync failed",
        });
      }
    }

    return NextResponse.json({ ingested, failed });
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
