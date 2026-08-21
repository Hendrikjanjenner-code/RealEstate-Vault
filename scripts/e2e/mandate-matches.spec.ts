import crypto from 'node:crypto';
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { db, usersTable, sessionsTable } from '@workspace/db';

/**
 * Mandate matching: /api/mandates returns a live matches count and
 * /api/mandates/:id/matches returns the deals that fit the mandate's
 * asset classes, countries, and size range — using the same logic.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';

interface TestUser {
  id: string;
  sid: string;
}

async function createTestUser(label: string): Promise<TestUser> {
  const id = `e2e-${label}-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({
    id,
    email: `${id}@example.com`,
    firstName: 'E2E',
    lastName: label,
    role: 'investor',
  });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: {
        id,
        email: `${id}@example.com`,
        firstName: 'E2E',
        lastName: label,
        profileImageUrl: null,
        role: 'investor',
      },
      access_token: 'e2e-test',
    },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { id, sid };
}

async function apiAs(user: TestUser): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${user.sid}` },
  });
}

interface Mandate {
  id: number;
  assetClasses: string[];
  countries: string[];
  minSize: number;
  maxSize: number;
  matches: number;
}

interface Deal {
  id: number;
  assetClass: string;
  country: string;
  askingPrice: number | null;
}

const norm = (s: string) => s.trim().toLowerCase();

test('mandate matches endpoint returns deals fitting the criteria and the count agrees', async () => {
  const user = await createTestUser('matcher');
  const api = await apiAs(user);

  try {
    const mandatesRes = await api.get('/api/mandates');
    expect(mandatesRes.ok()).toBeTruthy();
    const mandates = (await mandatesRes.json()) as Mandate[];
    expect(mandates.length).toBeGreaterThan(0);

    let sawNonEmpty = false;
    for (const mandate of mandates) {
      const res = await api.get(`/api/mandates/${mandate.id}/matches`);
      expect(res.ok()).toBeTruthy();
      const deals = (await res.json()) as Deal[];

      // The list count agrees with the matches count shown on the card.
      expect(deals.length).toBe(mandate.matches);
      if (deals.length > 0) sawNonEmpty = true;

      // Every returned deal fits the mandate's asset classes and countries.
      for (const deal of deals) {
        expect(mandate.assetClasses.map(norm)).toContain(norm(deal.assetClass));
        expect(mandate.countries.map(norm)).toContain(norm(deal.country));
        // If price is visible to this viewer, it must sit within the range.
        if (deal.askingPrice != null) {
          expect(deal.askingPrice).toBeGreaterThanOrEqual(mandate.minSize);
          expect(deal.askingPrice).toBeLessThanOrEqual(mandate.maxSize);
        }
      }
    }

    // Seed data should produce at least one mandate with matches.
    expect(sawNonEmpty).toBe(true);

    // Unknown mandate id → 404
    const missing = await api.get('/api/mandates/999999/matches');
    expect(missing.status()).toBe(404);

    // Unauthenticated access to matches is rejected.
    const anon = await pwRequest.newContext({ baseURL: BASE });
    const anonRes = await anon.get(`/api/mandates/${mandates[0].id}/matches`);
    expect(anonRes.status()).toBe(401);
    await anon.dispose();
  } finally {
    await api.dispose();
  }
});
