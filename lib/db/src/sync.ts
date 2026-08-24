/**
 * Additive, non-interactive schema sync.
 *
 * `drizzle-kit push` prompts interactively as soon as any drift exists, so it
 * cannot run from the post-merge hook. This script instead:
 *   1. Runs `drizzle-kit export` to get the full DDL for the current schema.
 *   2. Compares it against the live database.
 *   3. Applies only ADDITIVE changes:
 *        - CREATE TABLE IF NOT EXISTS for missing tables
 *        - ALTER TABLE ... ADD COLUMN IF NOT EXISTS for missing columns
 *        - CREATE INDEX IF NOT EXISTS for missing indexes
 *        - ADD CONSTRAINT guarded against duplicate_object
 *   4. Reports (but never drops) tables/columns that exist in the DB but not
 *      in the schema, so stray drift is cleaned up deliberately by a human.
 *
 * It never drops or alters existing columns, so it is safe to run while other
 * task branches (with their own additive columns) share the same dev DB.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPackageDir = path.join(__dirname, "..");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; cannot sync schema.");
  process.exit(1);
}

function exportSchemaSql(): string {
  return execFileSync("npx", ["drizzle-kit", "export", "--config", "./drizzle.config.ts"], {
    cwd: dbPackageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

interface ParsedTable {
  name: string;
  createSql: string; // full CREATE TABLE statement
  columns: { name: string; def: string }[]; // def includes type/default/not null
  constraints: string[]; // CONSTRAINT ... lines
}

interface ParsedSchema {
  tables: ParsedTable[];
  indexes: string[]; // CREATE [UNIQUE] INDEX statements
  otherStatements: string[]; // e.g. ALTER TABLE ... ADD CONSTRAINT (FKs)
}

function parseExport(sql: string): ParsedSchema {
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const schema: ParsedSchema = { tables: [], indexes: [], otherStatements: [] };

  for (const stmt of statements) {
    const tableMatch = stmt.match(/^CREATE TABLE "([^"]+)" \(([\s\S]*)\)$/);
    if (tableMatch) {
      const [, name, body] = tableMatch;
      const columns: { name: string; def: string }[] = [];
      const constraints: string[] = [];
      for (const rawLine of body.split("\n")) {
        const line = rawLine.trim().replace(/,$/, "");
        if (!line) continue;
        if (line.startsWith("CONSTRAINT")) {
          constraints.push(line);
          continue;
        }
        const colMatch = line.match(/^"([^"]+)"\s+(.*)$/);
        if (colMatch) columns.push({ name: colMatch[1], def: colMatch[2] });
      }
      schema.tables.push({ name, createSql: stmt, columns, constraints });
    } else if (/^CREATE (UNIQUE )?INDEX /.test(stmt)) {
      schema.indexes.push(stmt);
    } else {
      schema.otherStatements.push(stmt);
    }
  }
  return schema;
}

async function main() {
  const schema = parseExport(exportSchemaSql());
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const applied: string[] = [];
  const warnings: string[] = [];

  try {
    // Snapshot current DB structure.
    const { rows: dbCols } = await client.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'`,
    );
    const dbTables = new Map<string, Set<string>>();
    for (const row of dbCols) {
      if (!dbTables.has(row.table_name)) dbTables.set(row.table_name, new Set());
      dbTables.get(row.table_name)!.add(row.column_name);
    }

    for (const table of schema.tables) {
      const existingCols = dbTables.get(table.name);
      if (!existingCols) {
        // Whole table missing: create it verbatim (guarded).
        const sql = table.createSql.replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ");
        await client.query(sql);
        applied.push(`created table "${table.name}"`);
        continue;
      }

      // Table exists: add any missing columns additively.
      const { rows: countRows } = await client.query(
        `SELECT EXISTS (SELECT 1 FROM "${table.name}" LIMIT 1) AS has_rows`,
      );
      const hasRows: boolean = countRows[0].has_rows;

      for (const col of table.columns) {
        if (existingCols.has(col.name)) continue;
        let def = col.def.replace(/\s*PRIMARY KEY\s*/, " ").trim();
        const hasDefault = /\bDEFAULT\b/i.test(def) || /^(serial|bigserial|smallserial)\b/i.test(def);
        if (/\bNOT NULL\b/i.test(def) && !hasDefault && hasRows) {
          def = def.replace(/\s*NOT NULL\s*/i, " ").trim();
          warnings.push(
            `column "${table.name}"."${col.name}" declared NOT NULL without default; added as nullable because the table has rows — backfill and tighten manually.`,
          );
        }
        await client.query(
          `ALTER TABLE "${table.name}" ADD COLUMN IF NOT EXISTS "${col.name}" ${def}`,
        );
        applied.push(`added column "${table.name}"."${col.name}"`);
      }

      // Table-level constraints (unique, composite PK): guard duplicates.
      for (const constraint of table.constraints) {
        await client.query(
          `DO $$ BEGIN
             ALTER TABLE "${table.name}" ADD ${constraint};
           EXCEPTION
             WHEN duplicate_object THEN NULL;
             WHEN duplicate_table THEN NULL;
             WHEN invalid_table_definition THEN NULL; -- e.g. PK already exists
           END $$`,
        );
      }

      // Report drift the other way (DB has extras the schema doesn't know).
      const schemaColNames = new Set(table.columns.map((c) => c.name));
      for (const dbCol of existingCols) {
        if (!schemaColNames.has(dbCol)) {
          warnings.push(
            `column "${table.name}"."${dbCol}" exists in the database but not in lib/db/src/schema — likely from another in-flight task branch, or stale drift to drop deliberately.`,
          );
        }
      }
    }

    // Indexes: create missing ones, and RECREATE any whose definition drifted
    // (e.g. a partial unique index whose WHERE predicate changed — plain
    // CREATE INDEX IF NOT EXISTS would silently keep the stale predicate and
    // lose the invariant the schema declares).
    const { rows: dbIndexes } = await client.query<{
      indexname: string;
      indexdef: string;
    }>(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`);
    const dbIndexDefs = new Map(dbIndexes.map((r) => [r.indexname, r.indexdef]));

    /**
     * Whether the live index named `indexName` matches the schema's DDL.
     * String comparison is unreliable (pg_indexes canonicalizes `IN (...)` to
     * `= ANY (ARRAY[...])`, adds casts, etc.), so we build a short-lived
     * shadow index from the schema DDL and compare Postgres's own canonical
     * definitions. Returns null when the shadow cannot be built (e.g. rows
     * violate a new unique predicate) — recreation would fail for the same
     * reason.
     */
    const indexMatchesSchema = async (
      indexName: string,
      indexStmt: string,
      existingDef: string,
    ): Promise<boolean | null> => {
      const shadowName = `${indexName.slice(0, 52)}_synccheck`;
      try {
        await client.query(`DROP INDEX IF EXISTS "${shadowName}"`);
        await client.query(
          indexStmt.replace(`"${indexName}"`, `"${shadowName}"`),
        );
        const { rows } = await client.query<{ indexdef: string }>(
          `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
          [shadowName],
        );
        const shadowDef = rows[0]?.indexdef.split(shadowName).join(indexName);
        return shadowDef != null && shadowDef === existingDef;
      } catch {
        return null;
      } finally {
        await client.query(`DROP INDEX IF EXISTS "${shadowName}"`).catch(() => {});
      }
    };

    for (const indexStmt of schema.indexes) {
      const nameMatch = indexStmt.match(/^CREATE (?:UNIQUE )?INDEX "([^"]+)"/);
      const indexName = nameMatch?.[1];
      const existingDef = indexName ? dbIndexDefs.get(indexName) : undefined;

      const matches =
        indexName && existingDef
          ? await indexMatchesSchema(indexName, indexStmt, existingDef)
          : undefined;
      if (matches === null) {
        warnings.push(
          `index "${indexName}" definition could not be verified against the schema (building it fails — existing rows may violate it); left unchanged.`,
        );
        continue;
      }
      if (indexName && existingDef && matches === false) {
        // Definition drifted: replace atomically. If existing rows violate the
        // new (stricter) definition, the transaction rolls back and the old
        // index stays in place — surfaced as a loud warning for manual dedupe.
        try {
          await client.query("BEGIN");
          await client.query(`DROP INDEX "${indexName}"`);
          await client.query(indexStmt);
          await client.query("COMMIT");
          applied.push(`recreated index "${indexName}" (definition changed)`);
        } catch (err) {
          await client.query("ROLLBACK");
          warnings.push(
            `index "${indexName}" definition drifted but could not be recreated (existing rows may violate it): ${err instanceof Error ? err.message : String(err)} — old index kept; deduplicate and re-run.`,
          );
        }
        continue;
      }

      await client.query(
        indexStmt.replace(/^CREATE (UNIQUE )?INDEX /, (m) => m + "IF NOT EXISTS "),
      );
    }

    for (const stmt of schema.otherStatements) {
      await client.query(
        `DO $$ BEGIN ${stmt}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
    }

    const schemaTableNames = new Set(schema.tables.map((t) => t.name));
    for (const dbTable of dbTables.keys()) {
      if (!schemaTableNames.has(dbTable)) {
        warnings.push(
          `table "${dbTable}" exists in the database but not in lib/db/src/schema — likely from another in-flight task branch, or stale drift to drop deliberately.`,
        );
      }
    }
  } finally {
    await client.end();
  }

  if (applied.length) {
    console.log("Applied additive schema changes:");
    for (const a of applied) console.log(`  + ${a}`);
  } else {
    console.log("Schema already up to date; no additive changes needed.");
  }
  for (const w of warnings) console.warn(`  ! ${w}`);
}

main().catch((err) => {
  console.error("Schema sync failed:", err);
  process.exit(1);
});
