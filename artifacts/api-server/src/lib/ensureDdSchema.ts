/**
 * Idempotent, additive schema guard for the Due Diligence / Q&A feature.
 *
 * Published deployments run against the production database without a
 * post-merge hook, so the API server ensures at startup that the tables and
 * columns this feature depends on exist. Every statement is additive and
 * guarded (IF NOT EXISTS / duplicate_object), so running it repeatedly or
 * against an already up-to-date database is a no-op. It never drops or
 * alters existing columns.
 *
 * The DDL below is the drizzle-kit export of lib/db/src/schema/dueDiligence.ts
 * and the ai_findings classification columns in lib/db/src/schema/dealAi.ts.
 * Keep them in lockstep when the schema evolves.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "dd_workstreams" (
    "id" serial PRIMARY KEY NOT NULL,
    "deal_id" integer NOT NULL,
    "key" text NOT NULL,
    "label" text NOT NULL,
    "responsible_engagement_id" integer,
    "status" text DEFAULT 'not_started' NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "dd_workstreams_deal_key_unique" UNIQUE("deal_id","key")
  )`,
  `CREATE TABLE IF NOT EXISTS "dd_items" (
    "id" serial PRIMARY KEY NOT NULL,
    "workstream_id" integer NOT NULL,
    "deal_id" integer NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "required" boolean DEFAULT false NOT NULL,
    "status" text DEFAULT 'open' NOT NULL,
    "note" text,
    "document_id" integer,
    "updated_by_user_id" text,
    "updated_by_name" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "deal_questions" (
    "id" serial PRIMARY KEY NOT NULL,
    "deal_id" integer NOT NULL,
    "category" text NOT NULL,
    "question" text NOT NULL,
    "detail" text,
    "asked_by_user_id" text NOT NULL,
    "asked_by_name" text,
    "assigned_engagement_id" integer,
    "assigned_party" text,
    "status" text DEFAULT 'open' NOT NULL,
    "answer_text" text,
    "answer_document_id" integer,
    "answered_by_user_id" text,
    "answered_by_name" text,
    "answered_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "ai_findings" ADD COLUMN IF NOT EXISTS "classification" text`,
  `ALTER TABLE "ai_findings" ADD COLUMN IF NOT EXISTS "classification_note" text`,
  `ALTER TABLE "ai_findings" ADD COLUMN IF NOT EXISTS "classification_document_id" integer`,
  `ALTER TABLE "ai_findings" ADD COLUMN IF NOT EXISTS "classified_by_user_id" text`,
  `ALTER TABLE "ai_findings" ADD COLUMN IF NOT EXISTS "classified_by_name" text`,
  `ALTER TABLE "ai_findings" ADD COLUMN IF NOT EXISTS "classified_at" timestamp`,
];

/** FK constraints are added separately, guarded against duplicate_object. */
const CONSTRAINTS: string[] = [
  `ALTER TABLE "dd_workstreams" ADD CONSTRAINT "dd_workstreams_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id")`,
  `ALTER TABLE "dd_workstreams" ADD CONSTRAINT "dd_workstreams_responsible_engagement_id_professional_engagements_id_fk" FOREIGN KEY ("responsible_engagement_id") REFERENCES "public"."professional_engagements"("id")`,
  `ALTER TABLE "dd_items" ADD CONSTRAINT "dd_items_workstream_id_dd_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."dd_workstreams"("id")`,
  `ALTER TABLE "dd_items" ADD CONSTRAINT "dd_items_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id")`,
  `ALTER TABLE "dd_items" ADD CONSTRAINT "dd_items_document_id_deal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."deal_documents"("id")`,
  `ALTER TABLE "deal_questions" ADD CONSTRAINT "deal_questions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id")`,
  `ALTER TABLE "deal_questions" ADD CONSTRAINT "deal_questions_assigned_engagement_id_professional_engagements_id_fk" FOREIGN KEY ("assigned_engagement_id") REFERENCES "public"."professional_engagements"("id")`,
  `ALTER TABLE "deal_questions" ADD CONSTRAINT "deal_questions_answer_document_id_deal_documents_id_fk" FOREIGN KEY ("answer_document_id") REFERENCES "public"."deal_documents"("id")`,
  `ALTER TABLE "ai_findings" ADD CONSTRAINT "ai_findings_classification_document_id_deal_documents_id_fk" FOREIGN KEY ("classification_document_id") REFERENCES "public"."deal_documents"("id")`,
];

export async function ensureDdSchema(): Promise<void> {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }
  for (const stmt of CONSTRAINTS) {
    // DO-block guard: ADD CONSTRAINT has no IF NOT EXISTS in Postgres.
    await db.execute(
      sql.raw(
        `DO $$ BEGIN ${stmt}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      ),
    );
  }
  logger.info("DD/Q&A schema guard applied");
}
