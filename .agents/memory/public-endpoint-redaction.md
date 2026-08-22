---
name: Public/anonymous endpoint rules
description: What completion review enforces for anonymous homepage data endpoints
---

Rules learned from review rejections on the anonymous homepage endpoints:

- Any anonymous deal data must honour each listing's `locationPrivacy` setting: region may only be shown for `region_only` (or non-confidential deals); `country_only`, legacy values (`district`/`city`/`exact`), and null all fall back to country only. The `region` column can hold district/city-level detail.
- **Why:** brokers explicitly choose the public location display; the region field is not safe to publish by default.
- Aggregate "verified professionals" style metrics must count a distinct, genuinely verified population (verified broker profiles + role-holding users, deduped by linked userId) — never raw row counts across linked tables.
- Static fallback figures on the homepage are only allowed when the API is unreachable (query error). A successful-but-empty response must render truthful zeros / an honest empty state, never fabricated numbers or invented cards.
- **How to apply:** any new public/anonymous endpoint or homepage metric — write Playwright e2e coverage (scripts/e2e) proving redaction per privacy mode, no double-counting, and empty-vs-unreachable UI behaviour.
