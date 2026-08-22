import crypto from 'node:crypto';
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { db, usersTable, sessionsTable, mandatesTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

/**
 * Mandate status lifecycle: the owner can pause/close/reopen a mandate via
 * PATCH /api/mandates/:id; non-owners get 403; list responses flag ownership
 * with isOwn.
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

const mandateInput = {
  title: 'E2E Status Lifecycle Mandate',
  investorName: 'E2E Capital',
  investorType: 'family_office',
  assetClasses: ['office'],
  countries: ['Germany'],
  minSize: 10_000_000,
  maxSize: 50_000_000,
  strategy: 'core',
};

test.describe('mandate status lifecycle', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let ownerApi: APIRequestContext;
  let strangerApi: APIRequestContext;
  let mandateId: number;

  test.beforeAll(async () => {
    owner = await createTestUser('owner');
    stranger = await createTestUser('stranger');
    ownerApi = await apiAs(owner);
    strangerApi = await apiAs(stranger);

    const created = await ownerApi.post('/api/mandates', { data: mandateInput });
    expect(created.status()).toBe(201);
    const body = await created.json();
    mandateId = body.id;
    expect(body.status).toBe('active');
    expect(body.isOwn).toBe(true);
  });

  test.afterAll(async () => {
    if (mandateId) await db.delete(mandatesTable).where(eq(mandatesTable.id, mandateId));
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, owner.sid));
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, stranger.sid));
    await db.delete(usersTable).where(eq(usersTable.id, owner.id));
    await db.delete(usersTable).where(eq(usersTable.id, stranger.id));
  });

  test('list flags ownership per viewer', async () => {
    const mine = await (await ownerApi.get('/api/mandates')).json();
    const found = mine.find((m: { id: number }) => m.id === mandateId);
    expect(found?.isOwn).toBe(true);

    const theirs = await (await strangerApi.get('/api/mandates')).json();
    const foundOther = theirs.find((m: { id: number }) => m.id === mandateId);
    expect(foundOther?.isOwn).toBe(false);
  });

  test('non-owner cannot change status', async () => {
    const res = await strangerApi.patch(`/api/mandates/${mandateId}`, {
      data: { status: 'closed' },
    });
    expect(res.status()).toBe(403);
  });

  test('unauthenticated PATCH is rejected', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE });
    const res = await anon.patch(`/api/mandates/${mandateId}`, {
      data: { status: 'closed' },
    });
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test('owner can pause, close, and reopen', async () => {
    const paused = await ownerApi.patch(`/api/mandates/${mandateId}`, {
      data: { status: 'paused' },
    });
    expect(paused.status()).toBe(200);
    expect((await paused.json()).status).toBe('paused');

    const closed = await ownerApi.patch(`/api/mandates/${mandateId}`, {
      data: { status: 'closed' },
    });
    expect((await closed.json()).status).toBe('closed');

    const reopened = await ownerApi.patch(`/api/mandates/${mandateId}`, {
      data: { status: 'active' },
    });
    expect((await reopened.json()).status).toBe('active');
  });

  test('legacy pre-enum status values do not break the mandate list', async () => {
    // Simulate a database row provisioned before the active/paused/closed enum.
    await db
      .update(mandatesTable)
      .set({ status: 'fulfilled' })
      .where(eq(mandatesTable.id, mandateId));

    const res = await ownerApi.get('/api/mandates');
    expect(res.status()).toBe(200);
    const list = await res.json();
    const legacy = list.find((m: { id: number }) => m.id === mandateId);
    // Read-time coercion maps unknown legacy statuses to "closed".
    expect(legacy?.status).toBe('closed');

    // Owner can still act on it (reopen).
    const reopened = await ownerApi.patch(`/api/mandates/${mandateId}`, {
      data: { status: 'active' },
    });
    expect(reopened.status()).toBe(200);
    expect((await reopened.json()).status).toBe('active');
  });

  test('invalid status is rejected', async () => {
    const res = await ownerApi.patch(`/api/mandates/${mandateId}`, {
      data: { status: 'archived' },
    });
    expect(res.status()).toBe(400);
  });
});
