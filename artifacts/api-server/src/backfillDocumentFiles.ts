// Standalone backfill: attach real placeholder files to every deal document
// that has no object_path. Safe to re-run; only touches rows missing a file.
//
// Run with:
//   pnpm exec esbuild src/backfillDocumentFiles.ts --bundle --platform=node \
//     --format=esm --external:pg-native --outfile=/tmp/backfill-doc-files.mjs
//   node /tmp/backfill-doc-files.mjs

import { attachFilesToDocuments } from "./lib/attachDocumentFiles";

attachFilesToDocuments()
  .then((n) => {
    console.log(`Attached files to ${n} document(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Backfill failed", err);
    process.exit(1);
  });
