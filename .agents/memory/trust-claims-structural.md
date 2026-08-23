---
name: Trust claims need structural enforcement
description: How to model "verified" badges/reviews so completion review accepts them
---
Rule: any user-facing trust claim (verified review, verified engagement, verified badge) must be derived server-side from a concrete referenced entity, never stored as a caller-settable boolean.
**Why:** the completion review rejected the professionals marketplace because `verifiedEngagement` was just a flag with no linkage; it demanded referential derivation plus an authenticated creation path.
**How to apply:** link the claim to a real row (e.g. accepted broker_connections / future deal-team engagements), derive the flag at insert time in the authenticated endpoint, exclude client input for it, and only serve seeded/editorial rows on isDemo profiles so injected data can't affect real accounts or ranking.
