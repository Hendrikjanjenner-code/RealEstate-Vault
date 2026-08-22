---
name: Completion review covers the whole branch diff
description: markTaskComplete review rejects on any regression in the merged-in base, not just your own edits
---
- The completion code review evaluates the entire diff the task will merge, including regressions inherited from base merges into the task branch.
**Why:** A one-line task was rejected repeatedly for unrelated bugs (wrong table in a toggle, response-schema mismatch, broken anonymous flow, passcode-broker 401) that arrived via merged base commits.
**How to apply:** Before markTaskComplete, run the root typecheck and sanity-check recently merged features touching your area; be prepared to fix inherited regressions or the review will block completion.
