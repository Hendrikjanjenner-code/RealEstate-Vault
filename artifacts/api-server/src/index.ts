import app from "./app";
import { logger } from "./lib/logger";
import { normalizeLegacyMandateStatuses } from "./lib/legacyData";
import { ensureDdSchema } from "./lib/ensureDdSchema";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Idempotent data reconciliation for databases provisioned before the
// mandate status enum (active/paused/closed) was introduced.
normalizeLegacyMandateStatuses().catch((err) => {
  logger.error({ err }, "Failed to normalize legacy mandate statuses");
});

// Additive schema guard so published deployments get the DD/Q&A tables and
// ai_findings classification columns without a manual migration step.
ensureDdSchema().catch((err) => {
  logger.error({ err }, "Failed to ensure DD/Q&A schema");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
