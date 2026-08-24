import crypto from 'node:crypto';
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import {
  db,
  usersTable,
  sessionsTable,
  dealsTable,
  accessRequestsTable,
  loisTable,
  loiCountersTable,
  notificationsTable,
} from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';

/**
 * Mobile counterproposal flow (Expo web build):
 *  1. When the manager has countered the investor's LOI, the mobile deal
 *     screen shows the counter terms with Accept/Withdraw actions; accepting
 *     moves the LOI to accepted.
 *  2. A withdrawn LOI is treated as closed on mobile: the Prepare LOI flow
 *     reappears so the investor can submit a new one.
 * Uses the same DB-session seeding pattern as mobile-nda-sign.spec.ts.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';
const EXPO_DOMAIN = process.env.REPLIT_EXPO_DEV_DOMAIN;

interface TestUser {
  id: string;
  sid: string;
}

async function createTestUser(label: string, role: 'investor' | 'broker'): Promise<TestUser> {
  const id = `e2e-${label}-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({
    id,
    email: `${id}@example.com`,
    firstName: 'E2E',
    lastName: label,
    role,
  });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: { id, email: `${id}@example.com`, firstName: 'E2E', lastName: label, profileImageUrl: null, role },
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

async function seedCounteredLoi(investor: TestUser, manager: TestUser, managerApi: APIRequestContext, label: string) {
  const [deal] = await db
    .insert(dealsTable)
    .values({
      title: `E2E Mobile Counter ${label} ${crypto.randomUUID().slice(0, 8)}`,
      dealType: 'hotel',
      assetClass: 'Hospitality',
      country: 'Netherlands',
      city: 'Haarlem',
      currency: 'EUR',
      confidential: true,
      askingPrice: 6_000_000,
      brokerUserId: manager.id,
      brokerName: 'E2E Manager',
      brokerCompany: 'E2E Brokerage',
    } as never)
    .returning({ id: dealsTable.id });
  await db.insert(accessRequestsTable).values({
    dealId: deal.id,
    dealTitle: 'E2E Mobile Counter',
    requesterUserId: investor.id,
    requesterName: 'Mia Investor',
    requesterCompany: 'Mia Capital',
    status: 'nda_signed',
    signerName: 'Mia Investor',
    signedAt: new Date(),
  } as never);
  const investorApi = await apiAs(investor);
  const loi = await (
    await investorApi.post(`/api/deals/${deal.id}/lois`, {
      data: { offerPrice: 5_400_000, exclusivityDays: 30, validityDays: 14 },
    })
  ).json();
  await investorApi.dispose();
  const counterRes = await managerApi.post(`/api/lois/${loi.id}/counter`, {
    data: { offerPrice: 5_700_000, conditions: 'Shorter exclusivity', exclusivityDays: 21, validityDays: 10 },
  });
  expect(counterRes.status()).toBe(201);
  const counter = await counterRes.json();
  return { dealId: deal.id, loiId: loi.id as number, counterId: counter.id as number };
}

async function cleanupDeal(dealId: number) {
  const loiIds = (await db.select({ id: loisTable.id }).from(loisTable).where(eq(loisTable.dealId, dealId))).map((r) => r.id);
  if (loiIds.length) await db.delete(loiCountersTable).where(inArray(loiCountersTable.loiId, loiIds));
  await db.delete(loisTable).where(eq(loisTable.dealId, dealId));
  await db.delete(accessRequestsTable).where(eq(accessRequestsTable.dealId, dealId));
  await db.delete(dealsTable).where(eq(dealsTable.id, dealId));
}

test('investor sees and accepts a counterproposal on the mobile deal screen', async ({ page }) => {
  test.skip(!EXPO_DOMAIN, 'REPLIT_EXPO_DEV_DOMAIN is not set (Expo dev server not available)');

  const investor = await createTestUser('mobile-counter-inv', 'investor');
  const manager = await createTestUser('mobile-counter-mgr', 'broker');
  const managerApi = await apiAs(manager);
  let dealId: number | null = null;

  try {
    const seeded = await seedCounteredLoi(investor, manager, managerApi, 'accept');
    dealId = seeded.dealId;

    await page.addInitScript((sid) => {
      window.localStorage.setItem('auth_session_token', sid);
    }, investor.sid);
    await page.goto(`https://${EXPO_DOMAIN}/deal/${dealId}`, { waitUntil: 'domcontentloaded' });

    // The counter card shows the manager's terms.
    const counterCard = page.getByTestId('card-counter-offer');
    await expect(counterCard).toBeVisible({ timeout: 30_000 });
    await expect(counterCard.getByText('EUR 5,700,000', { exact: false }).first()).toBeVisible();
    await expect(counterCard.getByText('Shorter exclusivity', { exact: false }).first()).toBeVisible();

    // Accept: LOI becomes accepted, counter card disappears.
    await page.getByTestId('button-accept-counter').click();
    await expect(page.getByTestId('badge-loi-status-accepted')).toBeVisible({ timeout: 20_000 });
    await expect(counterCard).not.toBeVisible();

    const [storedLoi] = await db.select().from(loisTable).where(eq(loisTable.id, seeded.loiId));
    expect(storedLoi.status).toBe('accepted');
    const [storedCounter] = await db.select().from(loiCountersTable).where(eq(loiCountersTable.id, seeded.counterId));
    expect(storedCounter.status).toBe('accepted');
  } finally {
    if (dealId != null) await cleanupDeal(dealId);
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, [investor.id, manager.id]));
    await db.delete(sessionsTable).where(inArray(sessionsTable.sid, [investor.sid, manager.sid]));
    await db.delete(usersTable).where(inArray(usersTable.id, [investor.id, manager.id]));
    await managerApi.dispose();
  }
});

test('a withdrawn LOI frees the mobile Prepare LOI flow again', async ({ page }) => {
  test.skip(!EXPO_DOMAIN, 'REPLIT_EXPO_DEV_DOMAIN is not set (Expo dev server not available)');

  const investor = await createTestUser('mobile-withdraw-inv', 'investor');
  const manager = await createTestUser('mobile-withdraw-mgr', 'broker');
  const managerApi = await apiAs(manager);
  let dealId: number | null = null;

  try {
    const seeded = await seedCounteredLoi(investor, manager, managerApi, 'withdraw');
    dealId = seeded.dealId;

    // Investor withdraws in response to the counter (via API, e.g. from web).
    const investorApi = await apiAs(investor);
    expect(
      (await investorApi.post(`/api/loi-counters/${seeded.counterId}/respond`, { data: { action: 'withdraw' } })).status(),
    ).toBe(200);
    await investorApi.dispose();

    await page.addInitScript((sid) => {
      window.localStorage.setItem('auth_session_token', sid);
    }, investor.sid);
    await page.goto(`https://${EXPO_DOMAIN}/deal/${dealId}`, { waitUntil: 'domcontentloaded' });

    // The withdrawn LOI is closed: mobile offers Prepare LOI again.
    await expect(page.getByTestId('button-prepare-loi')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('card-my-loi')).not.toBeVisible();
  } finally {
    if (dealId != null) await cleanupDeal(dealId);
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, [investor.id, manager.id]));
    await db.delete(sessionsTable).where(inArray(sessionsTable.sid, [investor.sid, manager.sid]));
    await db.delete(usersTable).where(inArray(usersTable.id, [investor.id, manager.id]));
    await managerApi.dispose();
  }
});
