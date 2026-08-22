// Attach real placeholder files to any deal_documents rows that have no
// object_path yet. Used by the seed script and runnable standalone as a
// backfill (see src/backfillDocumentFiles.ts).

import { db, dealDocumentsTable, dealsTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

import {
  generatePdf,
  generateXlsx,
  uploadSampleFile,
  PDF_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
} from "./sampleFiles";

function pdfLinesFor(docName: string, dealTitle: string, category: string | null) {
  return [
    `Deal: ${dealTitle}`,
    `Category: ${category ?? "General"}`,
    "",
    "This document is part of the confidential data room for the deal above.",
    "It is provided under the terms of the executed non-disclosure agreement.",
    "",
    "Contents of this sample document are placeholder material generated for",
    "demonstration purposes and do not represent an actual offering.",
    "",
    `File: ${docName}`,
  ];
}

function xlsxRowsFor(docName: string, dealTitle: string): string[][] {
  return [
    ["Item", "Description", "Value"],
    ["Document", docName, ""],
    ["Deal", dealTitle, ""],
    ["Unit 1", "Sample tenancy line", "1,250,000"],
    ["Unit 2", "Sample tenancy line", "980,000"],
    ["Unit 3", "Sample tenancy line", "1,410,000"],
    ["Total", "Gross annual income (EUR)", "3,640,000"],
    ["Note", "Placeholder figures for demonstration purposes", ""],
  ];
}

/**
 * For every deal document without an object_path, generate a matching
 * PDF/XLSX file, upload it to App Storage, and backfill object_path and
 * content_type. Returns the number of documents updated.
 */
export async function attachFilesToDocuments(): Promise<number> {
  const docs = await db
    .select({
      id: dealDocumentsTable.id,
      name: dealDocumentsTable.name,
      category: dealDocumentsTable.category,
      dealTitle: dealsTable.title,
    })
    .from(dealDocumentsTable)
    .innerJoin(dealsTable, eq(dealDocumentsTable.dealId, dealsTable.id))
    .where(isNull(dealDocumentsTable.objectPath));

  let updated = 0;
  for (const doc of docs) {
    const isSpreadsheet = /\.xlsx$/i.test(doc.name);
    const title = doc.name.replace(/\.(pdf|xlsx)$/i, "");
    const buffer = isSpreadsheet
      ? generateXlsx(xlsxRowsFor(doc.name, doc.dealTitle))
      : generatePdf(title, pdfLinesFor(doc.name, doc.dealTitle, doc.category));
    const contentType = isSpreadsheet ? XLSX_CONTENT_TYPE : PDF_CONTENT_TYPE;

    const objectPath = await uploadSampleFile(buffer, contentType);
    await db
      .update(dealDocumentsTable)
      .set({ objectPath, contentType })
      .where(eq(dealDocumentsTable.id, doc.id));
    updated++;
  }
  return updated;
}
