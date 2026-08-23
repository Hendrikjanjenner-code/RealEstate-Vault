import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { dealDocumentsTable, Deal } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

type DealDocument = typeof dealDocumentsTable.$inferSelect;

export const AI_MODEL = "gpt-5.6-terra";

const objectStorage = new ObjectStorageService();

/** Explicit, user-facing error raised by the AI pipeline (no silent fallbacks). */
export class AiAnalysisError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = "AiAnalysisError";
  }
}

export interface DocumentSegment {
  /** Human-readable location label, e.g. "Page 3" or "Sheet: Rent roll". */
  label: string;
  /** Page number when known (PDF). */
  page: number | null;
  text: string;
}

async function downloadDocumentBuffer(doc: DealDocument): Promise<Buffer> {
  if (!doc.objectPath) {
    throw new AiAnalysisError(
      "No file is attached to this document, so there is nothing to analyze.",
      409,
    );
  }
  try {
    const file = await objectStorage.getObjectEntityFile(doc.objectPath);
    const [buffer] = await file.download();
    return buffer;
  } catch (err) {
    throw new AiAnalysisError(
      `The document file could not be retrieved from storage: ${
        err instanceof Error ? err.message : String(err)
      }`,
      409,
    );
  }
}

function looksLike(doc: DealDocument, ...hints: string[]): boolean {
  const ct = (doc.contentType ?? "").toLowerCase();
  const name = doc.name.toLowerCase();
  const path = (doc.objectPath ?? "").toLowerCase();
  return hints.some(
    (h) => ct.includes(h) || name.endsWith(`.${h}`) || path.endsWith(`.${h}`),
  );
}

/**
 * Extract text segments from a data-room document. Supports PDF, Word
 * (docx), Excel (xlsx/xls/csv) and plain text. Fails explicitly for
 * unsupported or unreadable files.
 */
export async function extractDocumentSegments(
  doc: DealDocument,
): Promise<DocumentSegment[]> {
  const buffer = await downloadDocumentBuffer(doc);
  let segments: DocumentSegment[];

  if (looksLike(doc, "pdf")) {
    const { PDFParse } = await import("pdf-parse");
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      segments = result.pages.map((p, i) => ({
        label: `Page ${i + 1}`,
        page: i + 1,
        text: p.text,
      }));
    } catch (err) {
      throw new AiAnalysisError(
        `The PDF could not be read: ${err instanceof Error ? err.message : String(err)}`,
        422,
      );
    }
  } else if (looksLike(doc, "docx", "wordprocessingml", "msword", "doc")) {
    const mammoth = await import("mammoth");
    try {
      const result = await mammoth.extractRawText({ buffer });
      segments = [{ label: "Document", page: null, text: result.value }];
    } catch (err) {
      throw new AiAnalysisError(
        `The Word document could not be read: ${err instanceof Error ? err.message : String(err)}`,
        422,
      );
    }
  } else if (looksLike(doc, "xlsx", "xls", "spreadsheetml", "csv", "ms-excel")) {
    const XLSX = await import("xlsx");
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      segments = workbook.SheetNames.map((name) => ({
        label: `Sheet: ${name}`,
        page: null,
        text: XLSX.utils.sheet_to_csv(workbook.Sheets[name]),
      }));
    } catch (err) {
      throw new AiAnalysisError(
        `The spreadsheet could not be read: ${err instanceof Error ? err.message : String(err)}`,
        422,
      );
    }
  } else if (looksLike(doc, "txt", "text/plain", "md", "markdown")) {
    segments = [{ label: "Document", page: null, text: buffer.toString("utf-8") }];
  } else {
    throw new AiAnalysisError(
      `This file type is not supported for AI analysis (${doc.contentType ?? "unknown type"}). Supported: PDF, Word, Excel and plain text.`,
      422,
    );
  }

  segments = segments.filter((s) => s.text.trim().length > 0);
  if (segments.length === 0) {
    throw new AiAnalysisError(
      "No readable text was found in this document, so AI analysis is not possible (scanned images without a text layer are not supported).",
      422,
    );
  }
  return segments;
}

// ---------------------------------------------------------------------------
// AI calls
// ---------------------------------------------------------------------------

const FINDING_CATEGORIES = [
  "document_type",
  "date",
  "party",
  "expiration",
  "financial_value",
  "clause",
  "attention_point",
  "missing_information",
  "related_document",
  "legal",
  "tax",
] as const;

export interface ExtractedFinding {
  category: (typeof FINDING_CATEGORIES)[number];
  title: string;
  detail: string | null;
  severity: "low" | "medium" | "high" | null;
  confidence: "high" | "medium" | "low";
  sources: Array<{ page: number | null; section: string | null; excerpt: string | null }>;
}

export interface DocumentAnalysis {
  summary: {
    whatIsThisDocument: string;
    whyRelevantToTransaction: string;
    keyCommercialPoints: string[];
    importantDates: string[];
    obligationsAndConditions: string[];
    attentionPoints: string[];
    professionalVerificationNeeded: string;
  };
  findings: ExtractedFinding[];
}

export const MAX_CONTEXT_CHARS = 60000;

function segmentsToPrompt(segments: DocumentSegment[]): string {
  let out = "";
  for (const s of segments) {
    const chunk = `\n[${s.label}]\n${s.text.trim()}\n`;
    if (out.length + chunk.length > MAX_CONTEXT_CHARS) {
      out += `\n[NOTE] Document truncated for analysis after ${s.label}.\n`;
      break;
    }
    out += chunk;
  }
  return out;
}

async function callModelJson(system: string, user: string): Promise<unknown> {
  let raw: string;
  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    throw new AiAnalysisError(
      `The AI service could not process this request: ${
        err instanceof Error ? err.message : String(err)
      }. This may be a temporary rate limit or budget issue — try again later.`,
      502,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new AiAnalysisError(
      "The AI service returned an unreadable response. No analysis was stored — please try again.",
      502,
    );
  }
}

const ANALYSIS_SYSTEM_PROMPT = `You are a document-intelligence engine for an institutional real-estate transaction platform.
You extract facts and organize information; you NEVER give definitive legal, tax or financial conclusions.
Use careful language ("appears to", "potential attention point"). Flag anything uncertain for professional review.
Respond ONLY with a single JSON object matching exactly this shape:
{
  "summary": {
    "whatIsThisDocument": string,
    "whyRelevantToTransaction": string,
    "keyCommercialPoints": string[],
    "importantDates": string[],
    "obligationsAndConditions": string[],
    "attentionPoints": string[],
    "professionalVerificationNeeded": string
  },
  "findings": [
    {
      "category": one of ${JSON.stringify(FINDING_CATEGORIES)},
      "title": short string,
      "detail": string or null,
      "severity": "low"|"medium"|"high"|null (only for attention_point/legal/tax),
      "confidence": "high"|"medium"|"low",
      "sources": [{ "page": number or null, "section": string or null, "excerpt": short quote or null }]
    }
  ]
}
Every finding must include at least one source reference to where in the document it was found (use the [Page N]/[Sheet: X] labels; page = the number for Page labels, section = the label otherwise).
Include "missing_information" findings for information one would expect in this document type but which is absent (sources may reference the document as a whole with page and section null).
STRICT OUTPUT CONTRACT: include EVERY key shown above in every object (use null where not applicable), add NO extra keys, keep excerpts under 500 characters, and use integer page numbers only.`;

/**
 * Exact runtime contract for the model response. `strictObject` rejects
 * extra keys; wrong or missing fields fail the whole run — no coercion.
 */
const AnalysisResponseSchema = z.strictObject({
  summary: z.strictObject({
    whatIsThisDocument: z.string().min(1),
    whyRelevantToTransaction: z.string().min(1),
    keyCommercialPoints: z.array(z.string()),
    importantDates: z.array(z.string()),
    obligationsAndConditions: z.array(z.string()),
    attentionPoints: z.array(z.string()),
    professionalVerificationNeeded: z.string().min(1),
  }),
  findings: z.array(
    z.strictObject({
      category: z.enum(FINDING_CATEGORIES),
      title: z.string().min(1),
      detail: z.string().nullable(),
      severity: z.enum(["low", "medium", "high"]).nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      sources: z
        .array(
          z.strictObject({
            page: z.number().int().nullable(),
            section: z.string().nullable(),
            excerpt: z.string().max(500).nullable(),
          }),
        )
        .min(1),
    }),
  ),
});

export async function analyzeDocumentWithAi(
  dealContext: string,
  doc: DealDocument,
  segments: DocumentSegment[],
): Promise<DocumentAnalysis> {
  const user = `Deal context: ${dealContext}
Document name: "${doc.name}" (data-room category: ${doc.category}).

Valid source references for THIS document: ${segments
    .map((s) => (s.page != null ? `page ${s.page}` : `section "${s.label}"`))
    .join(", ")}. Use these exact values for "page"/"section" in sources.

Document content:
${segmentsToPrompt(segments)}`;

  const parsed = (await callModelJson(
    ANALYSIS_SYSTEM_PROMPT,
    user,
  )) as Partial<DocumentAnalysis>;

  // Strict validation against an exact runtime schema: any malformed model
  // output — wrong types, missing keys, extra keys, overlong excerpts —
  // fails the run explicitly (the caller stores it as a failed, audited
  // run). No coercion, no truncation, no silent normalization.
  const schemaResult = AnalysisResponseSchema.safeParse(parsed);
  if (!schemaResult.success) {
    const first = schemaResult.error.issues[0];
    throw new AiAnalysisError(
      `The AI service returned an invalid analysis (${first ? `${first.path.join(".")}: ${first.message}` : "schema mismatch"}). No analysis was stored — please try again.`,
      422,
    );
  }
  const { summary, findings } = schemaResult.data;

  // Cross-field checks: every supplied source location component must point
  // somewhere real in the extracted document, independently validated.
  const invalid = (what: string): AiAnalysisError =>
    new AiAnalysisError(
      `The AI service returned an invalid analysis (${what}). No analysis was stored — please try again.`,
      422,
    );
  const validPages = new Set(
    segments.map((s) => s.page).filter((p): p is number => p != null),
  );
  const validSections = new Set(
    segments.flatMap((s) => {
      const alts = [s.label];
      const idx = s.label.indexOf(": ");
      if (idx >= 0) alts.push(s.label.slice(idx + 2));
      return alts;
    }),
  );
  for (const f of findings) {
    for (const s of f.sources) {
      if (s.page != null && !validPages.has(s.page))
        throw invalid(`finding "${f.title}" cites non-existent page ${s.page}`);
      if (s.section != null && !validSections.has(s.section))
        throw invalid(`finding "${f.title}" cites unknown section "${s.section}"`);
      // Whole-document references (both null) are allowed for
      // missing_information findings only.
      if (s.page == null && s.section == null && f.category !== "missing_information")
        throw invalid(`finding "${f.title}" has a source without page or section`);
    }
  }
  return { summary, findings };
}

const ASSISTANT_SYSTEM_PROMPT = `You are the AI deal assistant inside a Deal Room on an institutional real-estate transaction platform.
You help summarize the transaction, identify missing documents, surface potential risks and prepare questions.
STRICT RULES:
- Only use the deal context and document information provided below. Never invent documents or facts.
- You never give definitive legal, tax or financial advice; recommend professional review for such questions ("Professional Review Recommended").
- If the provided context is insufficient to answer, say so explicitly.
- Answer concisely in the language of the user's question.`;

export async function askDealAssistant(
  context: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  question: string,
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
        { role: "system", content: `Authorized deal context:\n${context}` },
        ...history.slice(-10),
        { role: "user", content: question },
      ],
    });
    const answer = response.choices[0]?.message?.content;
    if (!answer) {
      throw new AiAnalysisError(
        "The AI service returned an empty answer. Please try again.",
        502,
      );
    }
    return answer;
  } catch (err) {
    if (err instanceof AiAnalysisError) throw err;
    throw new AiAnalysisError(
      `The AI assistant could not process this request: ${
        err instanceof Error ? err.message : String(err)
      }. This may be a temporary rate limit or budget issue — try again later.`,
      502,
    );
  }
}
