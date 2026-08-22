// Attach real placeholder files to any deal_documents rows that have no
// object_path yet. Used by the seed script and runnable standalone as a
// backfill (see src/backfillDocumentFiles.ts).

import { db, dealDocumentsTable, dealsTable } from "@workspace/db";
import { eq, isNull, isNotNull } from "drizzle-orm";

import { objectStorageClient, parseObjectPath } from "./objectStorage";

import {
  generatePdf,
  generateXlsx,
  uploadSampleFile,
  PDF_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
} from "./sampleFiles";

function pdfLinesFor(docName: string, dealTitle: string, category: string | null) {
  const bodyByCategory: Record<string, string[]> = {
    Teaser: [
      "Executive summary: institutional-grade asset offered strictly off-market.",
      "Key metrics, tenancy overview, and location analysis are summarised in",
      "this teaser; the full information memorandum is available in the data",
      "room after execution of the non-disclosure agreement.",
    ],
    Financials: [
      "Financial overview: rent roll summary, income statement, and service",
      "charge reconciliation for the asset above. Figures reflect the position",
      "as at the most recent quarter and are subject to vendor due diligence.",
    ],
    Valuation: [
      "Independent valuation prepared in accordance with RICS Valuation -",
      "Global Standards. Market value derived from income capitalisation and",
      "supported by comparable transaction evidence in the relevant submarket.",
    ],
    Technical: [
      "Technical assessment covering building fabric, M&E installations,",
      "compliance, and ESG performance. No defects material to the transaction",
      "were identified; recommended capex items are scheduled in the annex.",
    ],
    Legal: [
      "Legal documentation pack: title, encumbrances, planning consents, and",
      "lease documentation reviewed by the vendor's counsel. Executed originals",
      "are available for inspection upon request.",
    ],
    Memorandum: [
      "Confidential information memorandum: full asset description, market",
      "commentary, tenancy detail, and transaction process guidance for",
      "vetted counterparties under NDA.",
    ],
  };
  const body = bodyByCategory[category ?? ""] ?? [
    "This document is part of the confidential data room for the deal above.",
    "It is provided under the terms of the executed non-disclosure agreement.",
  ];
  return [
    `Deal: ${dealTitle}`,
    `Category: ${category ?? "General"}`,
    "",
    ...body,
    "",
    "FICTIONAL DEMO DOCUMENT - generated for demonstration purposes only.",
    "It does not represent an actual offering, asset, or counterparty.",
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
    ["Note", "Fictional demo figures for demonstration purposes only", ""],
  ];
}

/**
 * Best-effort deletion of the storage objects behind existing deal
 * documents. Used by the seed script before it clears the documents table,
 * so re-seeding does not leak orphaned objects in App Storage.
 */
export async function deleteAttachedDocumentFiles(): Promise<number> {
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  if (!privateDir) return 0;

  const docs = await db
    .select({ objectPath: dealDocumentsTable.objectPath })
    .from(dealDocumentsTable)
    .where(isNotNull(dealDocumentsTable.objectPath));

  let deleted = 0;
  for (const { objectPath } of docs) {
    if (!objectPath?.startsWith("/objects/")) continue;
    const fullPath = `${privateDir}/${objectPath.slice("/objects/".length)}`;
    try {
      const { bucketName, objectName } = parseObjectPath(fullPath);
      await objectStorageClient
        .bucket(bucketName)
        .file(objectName)
        .delete({ ignoreNotFound: true });
      deleted++;
    } catch {
      // Best-effort: a failed delete should never block re-seeding.
    }
  }
  return deleted;
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
