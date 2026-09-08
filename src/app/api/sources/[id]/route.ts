import { NextResponse } from "next/server";
import { requireUser, UnauthorisedError } from "@/lib/auth";
import { rebuildConceptIndex } from "@/lib/rag/ingest";
import { deleteDocument } from "@/lib/store";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const removed = await deleteDocument(user.id, id);
    if (!removed) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    // Concepts are corpus-wide, so removing a document can retire some of them.
    await rebuildConceptIndex(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
}
