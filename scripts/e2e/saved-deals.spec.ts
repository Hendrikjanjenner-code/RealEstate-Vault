import crypto from 'node:crypto';
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { db, usersTable, sessionsTable, savedDealsTable } from '@workspace/db';
import { inArray } from 'drizzle-orm';

/**
 * Per-user saved deals: saving a deal as one investor must not affect
 * another investor's saved state or savedOnly list.
 *
 * Sessions are created directly in the DB (Bearer <sid> auth) so the API
 * can be exercised as two distinct signed-in users.
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

test('saved deals are personal to each signed-in user', async () => {
  const alice = await createTestUser('alice');
  const bob = await createTestUser('bob');
  const aliceApi = await apiAs(alice);
  const bobApi = await apiAs(bob);

  try {
    // Both start with nothing saved.
    const initial = (await (await aliceApi.get('/api/deals')).json()) as Array<{
      id: number;
      saved: boolean;
    }>;
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.every((d) => d.saved === false)).toBe(true);

    const dealId = initial[0].id;

    // Alice saves the first deal.
    const toggled = await aliceApi.patch(`/api/deals/${dealId}/save`);
    expect(toggled.ok()).toBeTruthy();
    expect(((await toggled.json()) as { saved: boolean }).saved).toBe(true);

    // Alice sees it saved; savedOnly returns exactly that deal.
    const aliceDeals = (await (await aliceApi.get('/api/deals')).json()) as Array<{
      id: number;
      saved: boolean;
    }>;
    expect(aliceDeals.find((d) => d.id === dealId)?.saved).toBe(true);
    const aliceSaved = (await (
      await aliceApi.get('/api/deals?savedOnly=true')
    ).json()) as Array<{ id: number }>;
    expect(aliceSaved.map((d) => d.id)).toEqual([dealId]);

    // Bob does NOT see Alice's save.
    const bobDeals = (await (await bobApi.get('/api/deals')).json()) as Array<{
      id: number;
      saved: boolean;
    }>;
    expect(bobDeals.find((d) => d.id === dealId)?.saved).toBe(false);
    const bobSaved = (await (
      await bobApi.get('/api/deals?savedOnly=true')
    ).json()) as Array<{ id: number }>;
    expect(bobSaved).toEqual([]);

    // Un-saving removes only Alice's row.
    const untoggled = await aliceApi.patch(`/api/deals/${dealId}/save`);
    expect(((await untoggled.json()) as { saved: boolean }).saved).toBe(false);
    const aliceSavedAfter = (await (
      await aliceApi.get('/api/deals?savedOnly=true')
    ).json()) as Array<{ id: number }>;
    expect(aliceSavedAfter).toEqual([]);
  } finally {
    await aliceApi.dispose();
    await bobApi.dispose();
    // Clean up test rows.
    await db
      .delete(savedDealsTable)
      .where(inArray(savedDealsTable.userId, [alice.id, bob.id]));
    await db
      .delete(sessionsTable)
      .where(inArray(sessionsTable.sid, [alice.sid, bob.sid]));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, [alice.id, bob.id]));
  }
});
