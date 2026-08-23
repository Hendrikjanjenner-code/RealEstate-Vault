---
name: Manager-fallback authz on confidential endpoints
description: The data-room "any broker manages unowned deals" convenience fallback must not gate confidential endpoints (financials, AI, advisory).
---

Rule: confidential deal endpoints must resolve "manager" strictly as `deal.brokerUserId === req.user.id` — never via the data-room convenience fallback that lets any authenticated broker manage an unowned deal.

**Why:** code review rejected the financials feature because unowned (seeded) deals let any broker read confidential figures via the fallback. Same class of leak applies to any new confidential endpoint reusing `canManageDealDocuments`.

**How to apply:** for new confidential routes, write a strict manager check (or reuse `isFinancialManager` in deal-financials routes) plus `getAccessStatuses` for granted viewers. Also: mutations on user-owned rows tied to a deal (e.g. financing scenarios) must re-check *current* deal access, not just row ownership — access can be revoked after creation.
