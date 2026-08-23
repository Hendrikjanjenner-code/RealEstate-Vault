import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { dealsTable, dealDocumentsTable } from "./deals";

/**
 * One AI run: a document analysis, an assistant reply or a report
 * generation. Every run is stored for auditability, including failures
 * (explicit error, no silent fallback).
 */
export const aiAnalysisRunsTable = pgTable("ai_analysis_runs", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => dealsTable.id),
  documentId: integer("document_id").references(() => dealDocumentsTable.id),
  kind: text("kind").notNull(), // 'document_analysis' | 'assistant_reply' | 'report'
  // Access class the AI context was built with: 'full' (manager/granted deal
  // facts) or 'redacted'. Restricted viewers may only read 'redacted' output.
  contextAccess: text("context_access").notNull().default("full"),
  status: text("status").notNull().default("running"), // 'running' | 'completed' | 'failed'
  model: text("model").notNull(),
  // Structured AI summary (JSON string with the fixed question structure)
  // for document analyses; report body for reports.
  summary: text("summary"),
  error: text("error"),
  requestedByUserId: text("requested_by_user_id").notNull(),
  requestedByName: text("requested_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

/**
 * A single AI finding extracted from a document: type, party, date,
 * financial value, clause, attention point, missing information, related
 * document, legal or tax observation. Never a definitive conclusion.
 */
export const aiFindingsTable = pgTable("ai_findings", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => aiAnalysisRunsTable.id),
  dealId: integer("deal_id")
    .notNull()
    .references(() => dealsTable.id),
  documentId: integer("document_id").references(() => dealDocumentsTable.id),
  // 'document_type' | 'date' | 'party' | 'expiration' | 'financial_value' |
  // 'clause' | 'attention_point' | 'missing_information' |
  // 'related_document' | 'legal' | 'tax'
  category: text("category").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  severity: text("severity"), // for attention points: 'low' | 'medium' | 'high'
  confidence: text("confidence").notNull().default("medium"), // 'high' | 'medium' | 'low'
  // Provenance badge — strictly separated levels.
  reviewStatus: text("review_status").notNull().default("ai_generated"), // 'ai_generated' | 'professional_reviewed' | 'verified'
  reviewedByUserId: text("reviewed_by_user_id"),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Source reference: links a finding back to document + page/section. */
export const aiSourceReferencesTable = pgTable("ai_source_references", {
  id: serial("id").primaryKey(),
  findingId: integer("finding_id")
    .notNull()
    .references(() => aiFindingsTable.id),
  documentId: integer("document_id")
    .notNull()
    .references(() => dealDocumentsTable.id),
  page: integer("page"),
  section: text("section"),
  excerpt: text("excerpt"),
});

/** Per-user, per-deal AI assistant conversation history. */
export const aiAssistantMessagesTable = pgTable("ai_assistant_messages", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => dealsTable.id),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  // Whether the assistant reply could use every deal document or only an
  // authorized subset — recorded for transparency.
  restricted: boolean("restricted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AiAnalysisRun = typeof aiAnalysisRunsTable.$inferSelect;
export type AiFinding = typeof aiFindingsTable.$inferSelect;
export type AiSourceReference = typeof aiSourceReferencesTable.$inferSelect;
export type AiAssistantMessage = typeof aiAssistantMessagesTable.$inferSelect;
