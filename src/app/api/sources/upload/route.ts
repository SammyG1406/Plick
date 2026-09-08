import { withUser } from "@/lib/api";
import { isSupported, parseFile, SUPPORTED_EXTENSIONS } from "@/lib/parse";
import { ingestDocument } from "@/lib/rag/ingest";

const MAX_BYTES = 20 * 1024 * 1024;

export const POST = withUser(async (user, request) => {
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) throw new Error("No files were uploaded.");

  const ingested = [];
  const failed: { name: string; reason: string }[] = [];

  for (const file of files) {
    try {
      if (!isSupported(file.name)) {
        throw new Error(`Unsupported type. Accepted: ${SUPPORTED_EXTENSIONS.join(", ")}`);
      }
      if (file.size > MAX_BYTES) throw new Error("File is larger than 20 MB.");

      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await parseFile(file.name, buffer);
      const report = await ingestDocument(user.id, {
        externalId: `upload:${file.name}`,
        // The filename usually carries the week marker, so keep it in the title.
        title: file.name.replace(/\.[^.]+$/, ""),
        text,
        kind: "upload",
        origin: file.name,
      });
      ingested.push(report);
    } catch (error) {
      // One bad file shouldn't abort a multi-file upload.
      failed.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "Could not read file",
      });
    }
  }

  return { ingested, failed };
});
